import { z } from 'zod'

export const profileTextSchema = z.object({
  engine: z.enum(['Apple Vision', 'Android accessibility']), text: z.string().max(24000), photo_count: z.number().int().positive().optional(),
  lines: z.array(z.object({ text: z.string(), confidence: z.number().min(0).max(1), role: z.enum(['header', 'heading', 'text']).optional(), section: z.string().optional(), group: z.number().int().nonnegative().optional(), bounds: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().min(0).max(1), height: z.number().min(0).max(1) }) })),
  recognition_ms: z.number().nonnegative(), width: z.number().positive(), height: z.number().positive(),
})
export type ProfileText = z.infer<typeof profileTextSchema>

export function profileHeader(result: ProfileText) {
  const anchors = result.lines.filter(line => result.engine !== 'Android accessibility' || line.role === 'header').flatMap(line => {
    const match = line.text.trim().match(/^([\p{L}][\p{L}\p{M} .’'-]*?)\s*,?\s+(\d{2,3})\s*[^\p{L}\p{N}]*$/u)
    return match && line.confidence >= 0.5 && Number(match[2]) >= 18 && Number(match[2]) <= 120 ? [{ line, name: match[1].trim(), age: Number(match[2]) }] : []
  })
  if (anchors.length !== 1) throw new Error('Show one profile with its written name and age. Text capture could not locate a unique profile header; check the active profile or enter State manually.')
  return anchors[0]
}

// Locate the written name/age, rather than assuming a fixed phone size or crop.
// Only explicitly labelled location/bio text becomes those fields.
export function structureProfileText(result: ProfileText) {
  const lines = result.lines
  const anchor = profileHeader(result)
  const navigation = lines.filter(line => line.bounds.y > anchor.line.bounds.y && /^(swipe|explore|likes|chat|profile)$/i.test(line.text.trim()))
  // A navigation row has multiple controls aligned on a row; a lone "Likes"
  // in someone's bio is still profile content.
  const navigationRow = navigation.filter(line => navigation.some(other => other !== line && other.text.trim().toLowerCase() !== line.text.trim().toLowerCase() && Math.abs(other.bounds.y - line.bounds.y) <= Math.max(line.bounds.height, other.bounds.height)))
  const bottom = navigationRow.length ? Math.min(...navigationRow.map(line => line.bounds.y)) : 1
  const profileLines = result.engine === 'Android accessibility' ? lines : lines.filter(line => line.bounds.y >= anchor.line.bounds.y && line.bounds.y < bottom)
  const profile = { name: anchor.name, age: anchor.age, location: null as string | null, distance_km: null as number | null, photo_count: result.photo_count ?? null, bio: null as string | null, interests: [] as string[], other_visible_text: [] as string[], sections: {} as Record<string, string[]> }
  let section: 'details' | 'interests' | 'bio' = 'details'
  let sectionTitle = ''
  for (const line of profileLines) {
    if (line === anchor.line) continue
    const text = line.text.trim()
    if (line.section !== undefined) { sectionTitle = line.section; section = /^(about me|bio)$/i.test(sectionTitle) ? 'bio' : /^interests$/i.test(sectionTitle) ? 'interests' : 'details' }
    if (line.role === 'heading') { sectionTitle = text; section = /^(about me|bio)$/i.test(text) ? 'bio' : /^interests$/i.test(text) ? 'interests' : 'details'; continue }
    const distance = text.match(/^[^\p{L}\p{N}]*(\d+(?:[.,]\d+)?)\s*km\s+away\s*$/iu)
    if (distance) { profile.distance_km = Number(distance[1].replace(',', '.')); section = 'details'; continue }
    if (/^(?:reply|share profile|report|block|recently active|[^\p{L}]*matched\s+\d+\s+preferences|\d+\s+photos)\s*[^\p{L}\p{N}]*$/iu.test(text) || !/[\p{L}\p{N}]/u.test(text)) continue
    if (/^[^\p{L}]*interests\s*:?$/iu.test(text)) { section = 'interests'; continue }
    const location = text.match(/^[^\p{L}]*(?:location|lives in|living in|based in)\s*:?\s+(.+)$/iu)
    if (location) { profile.location = location[1]; section = 'details'; continue }
    const bio = text.match(/^[^\p{L}]*(?:about me|bio)\s*:?\s*(.*)$/iu)
    if (bio) { section = 'bio'; if (bio[1]) profile.bio = bio[1]; continue }
    if (/^(?:looking for|relationship goals|basics|lifestyle|languages|\d+\s*(?:km|miles) away)\b/i.test(text)) section = 'details'
    if (section === 'interests') profile.interests.push(text)
    else if (section === 'bio') profile.bio = [profile.bio, text].filter(Boolean).join('\n')
    else if (sectionTitle) (profile.sections[sectionTitle] ??= []).push(text)
    else profile.other_visible_text.push(text)
  }
  return { profile, profileText: profileLines.map(line => line.text).join('\n'), ignoredText: result.lines.filter(line => !profileLines.includes(line)).map(line => line.text).join('\n') }
}
export async function recognizeProfileText(image: string) {
  const response = await fetch('/api/profile-text', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image }), signal: AbortSignal.timeout(20000) })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error)
  const text = profileTextSchema.parse(result)
  if (!text.text.trim()) throw new Error('No readable profile text found. Show the name, age and bio in the image, then try again.')
  return text
}
export async function readProfileText(image: string) {
  const text = await recognizeProfileText(image)
  return { ...text, ...structureProfileText(text) }
}
