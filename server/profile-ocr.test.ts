import assert from 'node:assert/strict'
import { test } from 'node:test'
import { profileImageSchema } from './profile-ocr.ts'
import { profileTextSchema, structureProfileText } from '../src/lib/profile-ocr.ts'

test('profile OCR accepts embedded images and rejects remote URLs and oversized input', () => {
  assert.equal(profileImageSchema.safeParse({ image: 'data:image/png;base64,aGVsbG8=' }).success, true)
  assert.equal(profileImageSchema.safeParse({ image: 'https://example.com/profile.png' }).success, false)
  assert.equal(profileImageSchema.safeParse({ image: 'data:image/svg+xml;base64,aGVsbG8=' }).success, false)
  assert.equal(profileImageSchema.safeParse({ image: 'data:image/jpeg;base64,' + Buffer.alloc(4 * 1024 * 1024 + 1).toString('base64') }).success, false)
})
test('OCR text and actual recognition metadata survive response validation', () => {
  const response = { engine: 'Apple Vision', text: 'Sofia, 29\nLisbon', lines: [{ text: 'Sofia, 29', confidence: 0.98, bounds: { x: 0.1, y: 0.2, width: 0.6, height: 0.04 } }, { text: 'Lisbon', confidence: 0.9, bounds: { x: 0.1, y: 0.3, width: 0.6, height: 0.04 } }], recognition_ms: 87, width: 600, height: 800 }
  assert.deepEqual(profileTextSchema.parse(response), response)
  assert.equal(profileTextSchema.safeParse({ ...response, lines: [{ text: 'Invented', confidence: 1.5 }] }).success, false)
})

function fixture(entries: [string, number, number?][]) {
  return { engine: 'Apple Vision' as const, width: 279, height: 564, recognition_ms: 100, text: entries.map(([text]) => text).join('\n'), lines: entries.map(([text, y, confidence = 1]) => ({ text, confidence, bounds: { x: 0.05, y, width: 0.6, height: 0.02 } })) }
}
test('profile extraction excludes navigation, preserves OCR spelling and never invents missing fields', () => {
  const result = structureProfileText(fixture([
    ['21:20', 0.04], ['For You', 0.08], ['Travel', 0.1], ['Alex 37', 0.60], ['8 Interests', 0.64, 0.3],
    ['Mountains', 0.68], ['Travel', 0.70], ['Hikine', 0.74, 0.3], ['Wine', 0.77], ['Explore', 0.91], ['Chat', 0.91], ['Protic', 0.93],
  ]))
  assert.deepEqual(result.profile, { name: 'Alex', age: 37, location: null, distance_km: null, photo_count: null, bio: null, sections: {}, interests: ['Mountains', 'Travel', 'Hikine', 'Wine'], other_visible_text: [] })
  assert.doesNotMatch(result.profileText, /For You|Explore|Protic|21:20/)
  assert.match(result.ignoredText, /For You/)
})
test('explicit labels populate location and bio while unlabelled details stay unclassified', () => {
  const result = structureProfileText(fixture([['Sofia, 29', 0.2], ['Lisbon', 0.3], ['Lives in: Berlin', 0.4], ['About me', 0.5], ['Likes', 0.55], ['Weekend hikes', 0.6], ['Interests', 0.7], ['Cooking', 0.8]]))
  assert.deepEqual(result.profile, { name: 'Sofia', age: 29, location: 'Berlin', distance_km: null, photo_count: null, sections: {}, bio: 'Likes\nWeekend hikes', interests: ['Cooking'], other_visible_text: ['Lisbon'] })
  assert.throws(() => structureProfileText(fixture([['For You', 0.1], ['Interests', 0.7]])), /unique profile header/)
  assert.throws(() => structureProfileText(fixture([['Sofia 29', 0.2], ['Maya 31', 0.4]])), /unique profile header/)
})

test('written distance is numeric while unknown location remains null', () => {
  const result = structureProfileText(fixture([['Sofia, 29', 0.2], ['📍 12,5 km away', 0.3], ['About Me', 0.4], ['Weekend hikes', 0.5]]))
  assert.equal(result.profile.distance_km, 12.5)
  assert.equal(result.profile.location, null)
  assert.equal(result.profile.bio, 'Weekend hikes')
})
