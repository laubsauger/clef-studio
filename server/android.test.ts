import assert from 'node:assert/strict'
import { test } from 'node:test'
import { photoPagerFromUI } from './android-ui.ts'
import { androidRequestSchema } from './android.ts'
import { aggregateProfileText } from '../src/lib/android-profile.ts'

test('Android actions require a verified profile and expose no arbitrary shell commands or matching actions', () => {
  assert.equal(androidRequestSchema.safeParse({ serial: 'phone-123', action: 'capture' }).success, true)
  assert.equal(androidRequestSchema.safeParse({ serial: 'phone-123', action: 'next-photo' }).success, false)
  assert.equal(androidRequestSchema.safeParse({ serial: 'phone-123', action: 'next-photo', expected: { name: 'Sofia', age: 29 } }).success, true)
  for (const action of ['like', 'pass', 'shell', 'tap']) assert.equal(androidRequestSchema.safeParse({ serial: 'phone-123', action, expected: { name: 'Sofia', age: 29 } }).success, false)
  assert.equal(androidRequestSchema.safeParse({ serial: 'phone;rm -rf /', action: 'capture' }).success, false)
})
function screen(text: string[], name = 'Sofia, 29') {
  const lines = [name, ...text].map((text, index) => ({ text, confidence: 1, bounds: { x: 0.1, y: 0.08 + index * 0.09, width: 0.7, height: 0.025 } }))
  return { engine: 'Apple Vision' as const, text: lines.map(line => line.text).join('\n'), lines, width: 1080, height: 2340, recognition_ms: 100 }
}
test('overlapping bio screens merge without duplicate lines, controls or mixed profile identities', () => {
  const result = aggregateProfileText([
    screen(['Reply', 'Looking for', 'Short-term fun', '6 About Me', 'I like hiking', 'and cooking for friends.']),
    screen(['6 About Me', 'I like hiking', 'and cooking for friends.', 'Ask me about my travels.', 'Interests', 'Nature', 'Cooking']),
  ])
  assert.equal(result.profile.name, 'Sofia')
  assert.equal(result.profile.bio, 'I like hiking\nand cooking for friends.\nAsk me about my travels.')
  assert.deepEqual(result.profile.interests, ['Nature', 'Cooking'])
  assert.equal(result.profile.location, null)
  assert.doesNotMatch(result.profileText, /Reply/)
  assert.throws(() => aggregateProfileText([screen(['About Me', 'Hello']), screen(['About Me', 'Hi'], 'Maya 31')]), /identity changed/)
})
test('native photo metadata reads the active profile and ignores cards behind it', () => {
  const xml = '<hierarchy><node package="com.tinder" focusable="true" content-desc="Photo by Sofia, 2 of 8"/><node package="com.tinder" focusable="false" content-desc="Photo by Maya, 1 of 3"/></hierarchy>'
  assert.deepEqual(photoPagerFromUI(xml, 'Sofia'), { count: 8, index: 1 })
  assert.throws(() => photoPagerFromUI(xml, 'Maya'), /photo index/)
  assert.throws(() => photoPagerFromUI('<hierarchy><node package="com.tinder" focusable="true" content-desc="Photo by Sofia, 0 of 3"/></hierarchy>', 'Sofia'), /unsupported photo/)
})

test('accessibility retains section labels and clipped native text without OCR crop heuristics', async () => {
  const { nativeProfileFromUI } = await import('./android-ui.ts')
  const xml = `<hierarchy><node resource-id="com.tinder:id/name_row" bounds="[0,10][100,50]"><node resource-id="com.tinder:id/recs_card_user_headline_name" text="Sofia," bounds="[10,10][40,30]"/><node resource-id="com.tinder:id/recs_card_user_headline_age" text="29" bounds="[40,10][60,30]"/></node><node resource-id="com.tinder:id/profile_action_button" content-desc="Close profile" bounds="[80,10][100,30]"/><node resource-id="com.tinder:id/sparksProfileDetailScrollView" bounds="[0,50][100,200]"><node resource-id="com.tinder:id/pager" content-desc="Profile Media, Photo, 2 of 5" bounds="[0,50][100,100]"/><node resource-id="com.tinder:id/content" bounds="[0,100][100,140]"><node resource-id="com.tinder:id/infoViewTitle" text="About Me" bounds="[0,100][100,110]"/><node resource-id="com.tinder:id/description" text="My full paragraph includes text under the floating buttons." bounds="[0,110][100,140]"/></node><node resource-id="com.tinder:id/content" bounds="[0,140][100,180]"><node resource-id="com.tinder:id/expandableViewTitle" text="Essentials" bounds="[0,140][100,150]"/><node text="11 km away" bounds="[0,150][100,160]"/><node text="165 cm" bounds="[0,160][100,170]"/></node><node resource-id="com.tinder:id/content" bounds="[0,180][100,200]"><node resource-id="com.tinder:id/infoViewTitle" text="My perfect Sunday" bounds="[0,180][100,190]"/><node text="Coffee and hiking" bounds="[0,190][100,200]"/></node></node><node package="com.tinder" focusable="false" content-desc="Photo by Maya, 1 of 3" bounds="[0,0][100,200]"><node text="Maya 31" bounds="[0,10][100,30]"/></node></hierarchy>`
  const native = nativeProfileFromUI(xml, 100, 200)
  const profile = aggregateProfileText([native.text]).profile
  assert.deepEqual(native.pager, { index: 1, count: 5 })
  assert.equal(native.text.engine, 'Android accessibility')
  assert.equal(profile.photo_count, 5)
  assert.equal(profile.distance_km, 11)
  assert.equal(profile.bio, 'My full paragraph includes text under the floating buttons.')
  assert.deepEqual(profile.sections, { Essentials: ['165 cm'], 'My perfect Sunday': ['Coffee and hiking'] })
  assert.doesNotMatch(native.text.text, /Maya/)
})

test('native tags become labelled attributes after expansion without duplicated home text', () => {
  const home = { ...screen(['Short-term fun', 'Nature']), engine: 'Android accessibility' as const, photo_count: 4 }
  home.lines[0] = { ...home.lines[0], role: 'header' } as typeof home.lines[0]
  const details = { ...screen(['Relationship goals', 'Short-term fun', 'Interests', 'Nature', '11 km away']), engine: 'Android accessibility' as const, photo_count: 4 }
  const roles = ['header', 'heading', 'text', 'heading', 'text', 'text'] as const
  const result = aggregateProfileText([home, { ...details, lines: details.lines.map((line, i) => ({ ...line, role: roles[i] })) }])
  assert.deepEqual(result.profile.sections, { 'Relationship goals': ['Short-term fun'] })
  assert.deepEqual(result.profile.interests, ['Nature'])
  assert.deepEqual(result.profile.other_visible_text, [])
  assert.equal(result.profile.photo_count, 4)
  assert.equal(result.profile.distance_km, 11)
})

test('photo count is available to immediate capture, without opening the bio', async () => {
  const { immediateAndroidProfile } = await import('../src/lib/android-profile.ts')
  const text = { ...screen(['9 km away']), engine: 'Android accessibility' as const, photo_count: 6, lines: screen(['9 km away']).lines.map((line, index) => ({ ...line, role: index === 0 ? 'header' as const : 'text' as const })) }
  const result = immediateAndroidProfile({ image: 'data:image/png;base64,AA==', width: 1080, height: 2340, profile: { name: 'Sofia', age: 29 }, expanded: false, pager: { index: 2, count: 6 }, text })
  assert.equal(result.photos.length, 1)
  assert.equal(result.text.profile.photo_count, 6)
  assert.equal(result.text.profile.distance_km, 9)
})

test('native bio stays separate from home attributes and overlapping containers retain their section owner', async () => {
  const { structuredProfileSections } = await import('../src/lib/android-profile.ts')
  const base = screen([])
  const line = (text: string, section: string, group?: number) => ({ text, section, group, role: 'text' as const, confidence: 1, bounds: { x: .1, y: .5, width: .8, height: .04 } })
  const header = { ...base.lines[0], role: 'header' as const }
  const capture = (lines: ReturnType<typeof line>[]) => ({ ...base, engine: 'Android accessibility' as const, lines: [header, ...lines] })
  const merged = aggregateProfileText([
    capture([line('The actual biography.', 'About Me'), line('Sober', ''), line('Long-term partner', '')]),
    capture([line('Drinking', 'Lifestyle', 0), line('Sober', 'Lifestyle', 0), line('Smoking', 'Lifestyle', 0)]),
    capture([line('Smoking', '', 0), line('Social smoker', '', 0), line('Family Plans', 'Basics', 1), line("I have children and don't want more", 'Basics', 1)]),
  ])
  assert.equal(merged.profile.bio, 'The actual biography.')
  assert.deepEqual(merged.profile.sections.Lifestyle, { Drinking: 'Sober', Smoking: 'Social smoker' })
  assert.equal(merged.profile.attributes.family_plans, "I have children and don't want more")
  assert.deepEqual(structuredProfileSections({ 'My hidden talent is…': ['Cooking'], Basics: ['Family Plans', 'Want children'] }).prompts, { 'My hidden talent is…': 'Cooking' })
})

test('numeric XML entities become their original emoji rather than leaking into State', async () => {
  const { parseAndroidUI } = await import('./android-ui.ts')
  const nodes = parseAndroidUI('<hierarchy><node text="Sunset &#127749; and wine &#x1f377;"/></hierarchy>')
  assert.equal(nodes[0]['@_text'], 'Sunset 🌅 and wine 🍷')
})

test('Cancel interrupts the active ADB command and releases capture ownership', async () => {
  const { mkdtemp, writeFile, access, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { setTimeout: delay } = await import('node:timers/promises')
  const { androidStep, cancelAndroidCapture, androidDevices } = await import('./android.ts')
  const directory = await mkdtemp(join(tmpdir(), 'clef-adb-cancel-'))
  const marker = join(directory, 'capture-started')
  const previousPath = process.env.PATH
  await writeFile(join(directory, 'adb'), `#!${process.execPath}\nconst fs=require('node:fs'); if(process.argv.includes('devices')){process.stdout.write('List of devices attached\\ntest-phone device model:Test_Phone\\n')}else if(process.argv.includes('screencap')){fs.writeFileSync(${JSON.stringify(marker)},'started');setTimeout(()=>{},30000)}\n`, { mode: 0o755 })
  process.env.PATH = directory
  try {
    const operation = androidStep({ serial: 'test-phone', action: 'capture' }).then(() => { throw new Error('Capture should have been cancelled.') }, error => error as Error)
    for (let attempt = 0; attempt < 100; attempt++) { try { await access(marker); break } catch { await delay(10) } }
    await access(marker)
    const started = performance.now()
    assert.deepEqual(await cancelAndroidCapture('test-phone'), { cancelled: true })
    assert.match((await operation).message, /cancelled/)
    assert.ok(performance.now() - started < 1000)
    assert.equal((await androidDevices())[0].serial, 'test-phone')
    assert.deepEqual(await cancelAndroidCapture('test-phone'), { cancelled: false })
  } finally { process.env.PATH = previousPath; await rm(directory, { recursive: true, force: true }) }
})
