import { z } from 'zod'
import { profileTextSchema, structureProfileText } from './profile-ocr'
import type { ProfileText } from './profile-ocr'

const screenSchema = z.object({ image: z.string().startsWith('data:image/png;base64,'), width: z.number().positive(), height: z.number().positive(), text: profileTextSchema, profile: z.object({ name: z.string(), age: z.number() }), expanded: z.boolean(), pager: z.object({ count: z.number().int().min(1).max(12), index: z.number().int().min(0) }).optional() })
export type AndroidScreen = z.infer<typeof screenSchema>
export type ProfileCollection = { photos: string[]; text: ReturnType<typeof aggregateProfileText>; bioScreens: number }
export async function cancelAndroid(serial: string) {
  const response = await fetch('/api/android/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serial }) })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error)
  return body as { cancelled: boolean }
}
export function immediateAndroidProfile(screen: AndroidScreen): ProfileCollection {
  return { photos: [screen.image], text: aggregateProfileText([screen.text]), bioScreens: screen.expanded ? 1 : 0 }
}
export async function androidStep(serial: string, action: 'capture' | 'open-bio' | 'scroll-bio' | 'scroll-bio-up' | 'close-bio' | 'previous-photo' | 'next-photo', expected?: AndroidScreen['profile']) {
  const response = await fetch('/api/android/profile-step', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serial, action, expected }), signal: AbortSignal.timeout(45000) })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error)
  return screenSchema.parse(body)
}

const heading = /^[^\p{L}]*(about me|bio|interests|basics|lifestyle|looking for|languages|essentials|more about me|relationship goals)\s*:?\s*$/iu
function key(text: string) { return text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() }
const attributeLabels = new Set(['drinking', 'workout', 'smoking', 'pets', 'dietary preference', 'sleeping habits', 'social media', 'zodiac', 'education', 'family plans', 'communication style', 'love style', 'personality type', 'covid vaccine', 'religion', 'political views'])
export function structuredProfileSections(sections: Record<string, string[]>) {
  const result: Record<string, string[] | Record<string, string>> = {}
  const attributes: Record<string, string> = {}
  const prompts: Record<string, string> = {}
  for (const [title, entries] of Object.entries(sections)) {
    if (entries.length > 0 && entries.length % 2 === 0 && entries.every((entry, i) => i % 2 === 1 || attributeLabels.has(key(entry)))) {
      const pairs: Record<string, string> = {}
      for (let i = 0; i < entries.length; i += 2) { pairs[entries[i]] = entries[i + 1]; attributes[key(entries[i]).replaceAll(' ', '_')] = entries[i + 1] }
      result[title] = pairs
    } else if (/[?…]$/.test(title)) { prompts[title] = entries.join('\n') }
    else result[title] = entries
  }
  return { sections: result, attributes, prompts }
}
export function aggregateProfileText(captures: ProfileText[]) {
  if (!captures.length) throw new Error('No profile text was captured.')
  const first = structureProfileText(captures[0])
  const profile = { ...first.profile, interests: [] as string[], other_visible_text: [] as string[], sections: {} as Record<string, string[]> }
  let section = 'details'
  let sectionTitle = ''
  const bio: string[] = []
  const seen = new Set<string>()
  const cleanText: string[] = []
  const owners = new Map<string, Set<string>>()
  for (const capture of captures) for (const line of capture.lines) if (line.section && line.role === 'text') { const titles = owners.get(key(line.text)) ?? new Set<string>(); titles.add(line.section); owners.set(key(line.text), titles) }
  for (const capture of captures) {
    const parsed = structureProfileText(capture)
    if (parsed.profile.name !== profile.name || parsed.profile.age !== profile.age) throw new Error('Profile identity changed while collecting text.')
    if (parsed.profile.location) profile.location = parsed.profile.location
    if (parsed.profile.distance_km !== null) profile.distance_km = parsed.profile.distance_km
    if (parsed.profile.photo_count !== null) profile.photo_count = parsed.profile.photo_count
    const nav = capture.lines.filter(line => /^(swipe|explore|likes|chat|profile)$/i.test(line.text.trim()))
    const bottom = Math.min(0.80, ...nav.map(line => line.bounds.y))
    const groupTitles = new Map<number, Set<string>>()
    for (const line of capture.lines) if (line.group !== undefined) {
      const titles = groupTitles.get(line.group) ?? new Set<string>()
      if (line.section) titles.add(line.section)
      else for (const owner of owners.get(key(line.text)) ?? []) titles.add(owner)
      groupTitles.set(line.group, titles)
    }
    for (const line of capture.lines) {
      if (line.role === 'header' || (capture.engine !== 'Android accessibility' && (line.bounds.y < 0.15 || line.bounds.y + line.bounds.height > bottom))) continue
      const text = line.text.trim()
      if (line.section !== undefined) {
        const titles = line.group !== undefined ? groupTitles.get(line.group) : undefined
        sectionTitle = line.section || (titles?.size === 1 ? [...titles][0] : '')
        section = /^(about me|bio)$/i.test(sectionTitle) ? 'bio' : /^interests$/i.test(sectionTitle) ? 'interests' : 'details'
      }
      const title = text.match(heading)
      if (title || line.role === 'heading') { sectionTitle = title ? title[1] : text; section = /^(about me|bio)$/i.test(sectionTitle) ? 'bio' : /^interests$/i.test(sectionTitle) ? 'interests' : 'details'; continue }
      if (/^(reply|recently active|active|[^\p{L}]*matched\s+\d+\s+preferences|\d+\s+photos)\s*[^\p{L}\p{N}]*$/iu.test(text) || !/[\p{L}]/u.test(text) || /^.+\s+\d{2,3}\s*[^\p{L}\p{N}]*$/u.test(text)) continue
      const normalized = key(text)
      if (!seen.has(normalized)) { seen.add(normalized); cleanText.push(text) }
      if (/^[^\p{L}\p{N}]*\d+(?:[.,]\d+)?\s*km\s+away\s*$/iu.test(text) || /^[^\p{L}]*(location|lives in|living in|based in)\s*:?\s+.+$/iu.test(text)) continue
      if (section === 'bio') { if (!bio.some(item => key(item) === normalized)) bio.push(text) }
      else if (section === 'interests') { if (!profile.interests.some(item => key(item) === normalized)) profile.interests.push(text) }
      else if (sectionTitle) { const entries = profile.sections[sectionTitle] ?? []; if (!entries.some(item => key(item) === normalized)) entries.push(text); profile.sections[sectionTitle] = entries }
      else if (!profile.other_visible_text.some(item => key(item) === normalized)) profile.other_visible_text.push(text)
    }
  }
  profile.bio = bio.length ? bio.join('\n') : null
  const classified = [...bio, ...profile.interests, ...Object.values(profile.sections).flat()].map(key)
  profile.other_visible_text = profile.other_visible_text.filter(text => !classified.includes(key(text)))
  const structured = structuredProfileSections(profile.sections)
  return { profile: { ...profile, ...structured }, profileText: cleanText.join('\n'), ignoredText: captures.map(capture => structureProfileText(capture).ignoredText).join('\n') }
}

export async function collectAndroidProfile(initial: AndroidScreen, serial: string, onProgress: (message: string, screen: AndroidScreen, details: ReturnType<typeof aggregateProfileText>) => void, stopped: () => boolean, onPhoto?: (image: string, index: number, count: number) => void): Promise<ProfileCollection> {
  let current = initial
  const text: ProfileText[] = [initial.text]
  const photos: string[] = []
  async function step(action: Parameters<typeof androidStep>[1], message: string) {
    if (stopped()) throw new Error('Collection stopped. No further phone input was sent.')
    onProgress(message, current, aggregateProfileText(text))
    current = await androidStep(serial, action, initial.profile)
    return current
  }
  function visibleSignature(screen: AndroidScreen) {
    return screen.text.lines.filter(line => line.role !== 'header').map(line => `${key(line.text)}:${Math.round(line.bounds.y * screen.height)}:${Math.round(line.bounds.height * screen.height)}`).join('\n')
  }
  if (!initial.expanded) await step('open-bio', 'Opening the full profile and photo gallery…')
  else if (!initial.pager) {
    let atTop = false
    for (let page = 0; page < 10; page++) {
      const before = visibleSignature(current)
      await step('scroll-bio-up', 'Returning to the profile photos…')
      text.push(current.text)
      if (before === visibleSignature(current)) { atTop = true; break }
    }
    if (!atTop) throw new Error('Could not verify the top of the expanded profile after 10 screens. Collection stopped.')
  }
  const pager = current.pager
  if (!pager) throw new Error('The photo pager is unavailable in the expanded profile.')
  function gather() {
    const index = current.pager!.index
    if (photos[index]) return
    photos[index] = current.image; text.push(current.text)
    onPhoto?.(current.image, index, pager!.count)
    onProgress(`Captured ${photos.filter(Boolean).length}/${pager!.count} photos · photo ${index + 1}`, current, aggregateProfileText(text))
  }
  gather()
  const firstDirection = pager.index <= (pager.count - 1) / 2 ? -1 : 1
  for (const direction of [firstDirection, -firstDirection]) {
    while (direction === -1 ? current.pager!.index > 0 : current.pager!.index < pager.count - 1) {
      const index = current.pager!.index + direction
      await step(direction === -1 ? 'previous-photo' : 'next-photo', `Capturing photo ${index + 1} / ${pager.count}…`)
      if (!current.expanded || !current.pager || current.pager.count !== pager.count || current.pager.index !== index) throw new Error('Expanded photo indicators did not advance as expected. Collection stopped.')
      gather()
    }
  }
  let bioScreens = 0, complete = false, lastSignature: string | undefined
  for (let page = 0; page < 10; page++) {
    text.push(current.text); bioScreens++
    onProgress(`Reading expanded details · screen ${bioScreens}`, current, aggregateProfileText(text))
    const signature = visibleSignature(current)
    if (signature === lastSignature) { complete = true; break }
    lastSignature = signature
    await step('scroll-bio', `Reading profile details · screen ${page + 2}…`)
  }
  if (!complete) throw new Error('Bio did not reach a verifiable end after 10 screens. Collection stopped; review the phone manually.')
  await step('close-bio', 'Closing the profile details…')
  onProgress(`Captured ${photos.length} photos and ${bioScreens} detail screens.`, current, aggregateProfileText(text))
  const merged = aggregateProfileText(text)
  merged.profile.photo_count = pager.count
  return { photos, text: merged, bioScreens }
}
