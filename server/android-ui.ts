import { XMLParser } from 'fast-xml-parser'
import type { ProfileText } from '../src/lib/profile-ocr.ts'

type UINode = { node?: UINode[]; [key: string]: unknown }
const parser = new XMLParser({ ignoreAttributes: false, parseAttributeValue: false, htmlEntities: true, isArray: name => name === 'node' })
const attr = (node: UINode, name: string): string => { const value = node[`@_${name}`]; return typeof value === 'string' ? value : '' }
function flatten(nodes: UINode[]): UINode[] { return nodes.flatMap(node => [node, ...flatten(node.node ?? [])]) }
export function parseAndroidUI(output: string) {
  const start = output.indexOf('<hierarchy'), end = output.lastIndexOf('</hierarchy>')
  if (start < 0 || end < start) throw new Error('Android did not return a valid accessibility hierarchy.')
  const document = parser.parse(output.slice(start, end + '</hierarchy>'.length))
  return flatten(document.hierarchy.node)
}
export function photoPagerFromUI(output: string, name: string) {
  const nodes = parseAndroidUI(output).filter(node => attr(node, 'package') === 'com.tinder' && attr(node, 'focusable') === 'true')
  const matches = nodes.flatMap(node => {
    const match = attr(node, 'content-desc').match(/^Photo by (.+), (\d+) of (\d+)$/)
    if (!match || match[1] !== name) return []
    const index = Number(match[2]) - 1, count = Number(match[3])
    if (count < 1 || count > 12 || index < 0 || index >= count) throw new Error('Tinder returned an unsupported photo count or index.')
    return [{ index, count }]
  })
  if (matches.length !== 1) throw new Error('Could not read this profile’s photo index from Tinder. Show a profile in the photo view and refresh.')
  return matches[0]
}

function bounds(node: UINode) {
  const match = attr(node, 'bounds').match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/)
  if (!match) throw new Error('Android returned invalid control bounds.')
  return { x: Number(match[1]), y: Number(match[2]), width: Number(match[3]) - Number(match[1]), height: Number(match[4]) - Number(match[2]) }
}
export class NativeProfileUnavailable extends Error {}
function activeProfile(nodes: UINode[]) {
  const close = nodes.find(node => attr(node, 'resource-id') === 'com.tinder:id/profile_action_button' && attr(node, 'content-desc') === 'Close profile')
  const expanded = Boolean(close)
  const cards = nodes.filter(node => attr(node, 'package') === 'com.tinder' && attr(node, 'focusable') === 'true' && /^Photo by .+, \d+ of \d+$/.test(attr(node, 'content-desc')))
  const root = expanded ? nodes.find(node => attr(node, 'resource-id') === 'com.tinder:id/name_row') : cards.length === 1 ? cards[0] : undefined
  if (!root) throw new NativeProfileUnavailable('No active Tinder profile is accessible. Unlock the phone and dismiss any popup covering the profile.')
  const headerNodes = flatten([root])
  const nameNode = headerNodes.find(node => attr(node, 'resource-id') === 'com.tinder:id/recs_card_user_headline_name')
  const ageNode = headerNodes.find(node => attr(node, 'resource-id') === 'com.tinder:id/recs_card_user_headline_age')
  if (!nameNode || !ageNode) throw new Error('Tinder did not expose a written name and age for this profile.')
  const name = attr(nameNode, 'text').replace(/,$/, '').trim(), rawAge = attr(ageNode, 'text')
  if (!name || !/^\d{2,3}$/.test(rawAge) || Number(rawAge) < 18 || Number(rawAge) > 120) throw new Error('The accessible profile age is missing or outside the supported adult range.')
  const profile = { name, age: Number(rawAge) }
  return { profile, expanded, root, close }
}
export function nativeProfileIdentity(output: string) {
  const { profile, expanded } = activeProfile(parseAndroidUI(output))
  return { ...profile, expanded }
}
export function nativeProfileFromUI(output: string, width: number, height: number) {
  const nodes = parseAndroidUI(output)
  const { profile, expanded, root, close } = activeProfile(nodes)
  const { name } = profile
  const nameNode = flatten([root]).find(node => attr(node, 'resource-id') === 'com.tinder:id/recs_card_user_headline_name')!
  const contentRoot = expanded ? nodes.find(node => attr(node, 'resource-id') === 'com.tinder:id/sparksProfileDetailScrollView') : root
  if (!contentRoot) throw new Error('Tinder’s profile scrolling container is unavailable.')
  const body = flatten([contentRoot])
  const sections = new Map<UINode, string>()
  const groups = new Map<UINode, number>()
  for (const [index, node] of body.filter(node => attr(node, 'resource-id') === 'com.tinder:id/content').entries()) {
    const descendants = flatten([node])
    for (const child of descendants) groups.set(child, index)
    const title = descendants.find(child => /\/(infoViewTitle|expandableViewTitle)$/.test(attr(child, 'resource-id')))
    if (title) for (const child of descendants) sections.set(child, attr(title, 'text'))
  }
  const normalized = (node: UINode) => { const box = bounds(node); return { x: box.x / width, y: box.y / height, width: box.width / width, height: box.height / height } }
  const lines: ProfileText['lines'] = [{ text: `${name}, ${profile.age}`, confidence: 1, role: 'header', bounds: normalized(nameNode) }]
  for (const node of body) {
    const text = attr(node, 'text').trim(), id = attr(node, 'resource-id')
    if (!text || /recs_card_user_headline_|matched_preferences|first_impression_reply|navigation_bar_|\/label$/.test(id) || /^(\d+ Photos|View all \d+|Tinder Platinum|Share .+'s profile|Block .+|Report .+)$/i.test(text)) continue
    if (id.endsWith('/bio_element')) lines.push({ text: 'About Me', confidence: 1, role: 'heading', bounds: normalized(node) })
    lines.push({ text, confidence: 1, role: /\/(infoViewTitle|expandableViewTitle)$/.test(id) ? 'heading' : 'text', section: id.endsWith('/bio_element') ? 'About Me' : sections.get(node) ?? '', ...(groups.has(node) ? { group: groups.get(node) } : {}), bounds: normalized(node) })
  }
  let pager
  if (expanded) {
    const media = body.find(node => attr(node, 'resource-id') === 'com.tinder:id/pager')
    const match = media && attr(media, 'content-desc').match(/^Profile Media, Photo, (\d+) of (\d+)$/)
    if (media && !match) throw new Error('Tinder returned unreadable expanded photo metadata.')
    if (match) {
      pager = { index: Number(match[1]) - 1, count: Number(match[2]) }
      if (pager.count < 1 || pager.count > 12 || pager.index < 0 || pager.index >= pager.count) throw new Error('Tinder returned an invalid expanded photo index.')
    }
  } else pager = photoPagerFromUI(output, name)
  const text: ProfileText = { engine: 'Android accessibility', text: lines.map(line => line.text).join('\n'), lines, ...(pager ? { photo_count: pager.count } : {}), width, height, recognition_ms: 0 }
  const control = (description: string) => { const node = body.find(node => attr(node, 'content-desc') === description); return node ? bounds(node) : undefined }
  return { profile, expanded, pager, text, close: close ? bounds(close) : undefined, scroll: expanded ? bounds(contentRoot) : undefined, open: control('Open profile'), next: control('Next Media'), previous: control('Previous Media') }
}
