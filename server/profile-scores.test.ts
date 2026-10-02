import assert from 'node:assert/strict'
import { test } from 'node:test'
import { profileScores } from '../src/lib/profile-scores.ts'
import type { QueueItem } from '../src/lib/use-image-queue.ts'

function item(score: number, index: number): QueueItem {
  return { id: String(index), name: `Photo ${index}`, image: 'data:image/png;base64,AA==', status: 'done', run: { id: String(index), experiment: 'match', title: 'Dating', state: '{}', format: 'json', rules: 'Preferences', questions: { photo_attraction: { type: 'score', instructions: 'Attraction', criteria: ['0', '1', '2', '3'] } }, result: { model: 'clef-flash', provider: 'local', answers: { photo_attraction: { type: 'score', score, confidence: .9, legend: {}, probabilities: {} } }, usage: { input_tokens: 1, output_tokens: 0 }, latency_ms: 1, timestamp: '2026-10-02' } } }
}
test('combined score uses every completed photo, normalizes the rubric and resists one outlier', () => {
  const result = profileScores([item(0, 1), item(2.4, 2), item(2.7, 3)], 'photo_attraction')
  assert.equal(result.complete, true)
  assert.equal(result.total, 80)
  assert.equal(result.minimum, 0)
  assert.equal(result.maximum, 90)
  assert.equal(profileScores([item(0, 1), item(3, 2)], 'photo_attraction').total, 50)
})
test('incomplete or failed queues never present a final combined score', () => {
  for (const status of ['pending', 'running', 'error'] as const) {
    const result = profileScores([item(3, 1), { ...item(0, 2), status, run: undefined }], 'photo_attraction')
    assert.equal(result.complete, false)
    assert.equal(result.total, undefined)
  }
  assert.throws(() => profileScores([item(3, 1)], 'missing_question'), /score answer/)
})
