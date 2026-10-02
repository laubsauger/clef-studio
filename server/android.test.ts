import assert from 'node:assert/strict'
import { test } from 'node:test'
import { photoPagerFromUI, photoNavigationFromUI, nativeProfileFromUI } from './android-ui.ts'
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
  assert.deepEqual(photoNavigationFromUI(native, 'next', 100, 200), { kind: 'swipe', from: 80, to: 20, y: 75 })
  assert.deepEqual(photoNavigationFromUI(native, 'previous', 100, 200), { kind: 'swipe', from: 20, to: 80, y: 75 })
  assert.throws(() => photoNavigationFromUI({ ...native, pager: undefined, photo: undefined }, 'next', 100, 200), /pager is not visible/)
  assert.throws(() => photoNavigationFromUI({ ...native, pager: { index: 4, count: 5 } }, 'next', 100, 200), /first or last/)
  assert.throws(() => photoNavigationFromUI({ ...native, photo: { x: 0, y: 160, width: 100, height: 40 } }, 'next', 100, 200), /matching actions/)
})

test('home photo navigation keeps using its native tap controls', () => {
  const xml = `<hierarchy><node package="com.tinder" focusable="true" content-desc="Photo by Sofia, 2 of 3" bounds="[0,0][100,200]"><node resource-id="com.tinder:id/recs_card_user_headline_name" text="Sofia," bounds="[10,10][40,30]"/><node resource-id="com.tinder:id/recs_card_user_headline_age" text="29" bounds="[40,10][60,30]"/><node content-desc="Previous Media" bounds="[0,50][50,140]"/><node content-desc="Next Media" bounds="[50,50][100,140]"/></node></hierarchy>`
  const native = nativeProfileFromUI(xml, 100, 200)
  assert.deepEqual(photoNavigationFromUI(native, 'next', 100, 200), { kind: 'tap', x: 75, y: 95 })
  assert.deepEqual(photoNavigationFromUI(native, 'previous', 100, 200), { kind: 'tap', x: 25, y: 95 })
})

test('full collection returns from scrolled details to the gallery without closing and captures only expanded frames', async () => {
  const { collectAndroidProfile } = await import('../src/lib/android-profile.ts')
  const originalFetch = globalThis.fetch
  let index = 1, atTop = false, upward = 0
  const actions: string[] = [], captured: string[] = []
  const frame = (top: boolean, offset = .4) => {
    const source = screen(top ? ['About Me', 'The full biography.'] : ['Lifestyle', 'Non-smoker'])
    const lines = source.lines.map((line, i) => ({ ...line, role: i === 0 ? 'header' as const : i === 1 ? 'heading' as const : 'text' as const, section: i === 0 ? '' : top ? 'About Me' : 'Lifestyle', bounds: { ...line.bounds, y: i === 0 ? .02 : offset + i * .05 } }))
    return { image: `data:image/png;base64,${index === 0 ? 'AA==' : 'AQ=='}`, width: 1080, height: 2340, profile: { name: 'Sofia', age: 29 }, expanded: true, ...(top ? { pager: { index, count: 2 } } : {}), text: { ...source, engine: 'Android accessibility' as const, lines, ...(top ? { photo_count: 2 } : {}) } }
  }
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options!.body as string); actions.push(body.action)
    assert.deepEqual(body.expected, { name: 'Sofia', age: 29 })
    if (body.action === 'scroll-bio-up') { upward++; atTop = true }
    else if (body.action === 'previous-photo') { assert.equal(atTop, true); index-- }
    else if (body.action === 'scroll-bio') atTop = false
    else assert.equal(body.action, 'close-bio')
    const next = frame(atTop, upward === 1 ? .2 : .4)
    if (body.action === 'close-bio') next.expanded = false
    return new Response(JSON.stringify(next), { headers: { 'Content-Type': 'application/json' } })
  }
  try {
    const collection = await collectAndroidProfile(frame(false), 'test-phone', () => {}, () => false, image => captured.push(image))
    assert.deepEqual(actions, ['scroll-bio-up', 'scroll-bio-up', 'scroll-bio-up', 'previous-photo', 'scroll-bio', 'scroll-bio', 'close-bio'])
    assert.deepEqual(collection.photos, ['data:image/png;base64,AA==', 'data:image/png;base64,AQ=='])
    assert.equal(captured.length, 2)
    assert.equal(collection.text.profile.bio, 'The full biography.')
    assert.deepEqual(collection.text.profile.sections.Lifestyle, ['Non-smoker'])
    assert.equal(collection.text.profile.photo_count, 2)
    index = 1; atTop = true; actions.length = 0; captured.length = 0
    const alreadyExpanded = await collectAndroidProfile(frame(true), 'test-phone', () => {}, () => false, image => captured.push(image))
    assert.deepEqual(actions, ['previous-photo', 'scroll-bio', 'scroll-bio', 'close-bio'])
    assert.deepEqual(alreadyExpanded.photos, collection.photos)
    assert.equal(captured.length, 2)
  } finally { globalThis.fetch = originalFetch }
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
