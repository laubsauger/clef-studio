import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decisionSchema, validateResponse } from './schema.ts'

const questions = { action: { type: 'choice' as const, instructions: 'Classify', criteria: { yes: 'Proceed', no: 'Stop' } } }
const body = { provider: 'local', model: 'clef-flash', state: { number: 42, flags: ['ready'] }, questions, images: [] }
test('structured state survives validation, and unsupported local models fail', () => {
  assert.deepEqual(decisionSchema.parse(body).state, body.state)
  assert.equal(decisionSchema.safeParse({ ...body, model: 'clef' }).success, false)
  assert.equal(decisionSchema.safeParse({ ...body, state: '', questions: {} }).success, false)
})
test('remote image URLs and oversized payloads are rejected', () => {
  assert.equal(decisionSchema.safeParse({ ...body, images: ['https://example.com/image.png'] }).success, false)
  assert.equal(decisionSchema.safeParse({ ...body, images: ['data:image/jpeg;base64,' + Buffer.alloc(4 * 1024 * 1024 + 1).toString('base64')] }).success, false)
})
test('unknown options and absent answers never become a decision', () => {
  const result = { model: 'clef-flash', usage: { input_tokens: 42, output_tokens: 0 }, answers: { action: { type: 'choice', choice: 'yes', confidence: 0.9, probabilities: { yes: 0.9, no: 0.1 } } } }
  assert.equal(validateResponse(result, questions).answers.action.type, 'choice')
  assert.throws(() => validateResponse({ ...result, answers: {} }, questions))
  assert.throws(() => validateResponse({ ...result, answers: { action: { ...result.answers.action, choice: 'invented' } } }, questions))
  assert.throws(() => validateResponse({ ...result, answers: { action: { ...result.answers.action, probabilities: { yes: 0.9, invented: 0.1 } } } }, questions))
})
