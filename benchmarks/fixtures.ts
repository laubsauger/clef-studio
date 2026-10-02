import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { experiments } from '../src/lib/experiments.ts'
import type { Questions } from '../src/lib/experiments.ts'

const directory = '.benchmarks'
await mkdir(directory, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
try {
  const page = await browser.newPage()
  await page.goto('http://127.0.0.1:5173')
  const fixtures: { id: string; state: unknown; questions: Questions; image?: string; expected?: Record<string, string> }[] = []
  const rules = (questions: Questions, text: string): Questions => Object.fromEntries(Object.entries(questions).map(([id, question]) => [id, { ...question, instructions: `${question.instructions}\n\nDecision rules:\n${text}` }]))
  // Use the studio's actual browser normalization, including SVG rasterization.
  const image = async (source: string) => page.evaluate(async source => {
    const modulePath = '/src/lib/media.ts'
    const { imageData, loadImage } = await import(/* @vite-ignore */ modulePath)
    const img = await loadImage(source)
    return imageData(img, img.width, img.height)
  }, source)
  const color = experiments.find(item => item.id === 'color')!
  for (const [label, hex] of Object.entries({ red: '#e53935', orange: '#fb8c00', yellow: '#fdd835', green: '#43a047', blue: '#1e88e5', purple: '#8e24aa', black: '#000000', white: '#ffffff' })) {
    const data = await page.evaluate(hex => { const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480; const context = canvas.getContext('2d')!; context.fillStyle = hex; context.fillRect(0, 0, 640, 480); return canvas.toDataURL('image/png') }, hex)
    fixtures.push({ id: `color-${label}`, state: '', questions: rules(color.questions, color.rules), image: await image(data), expected: { color: label } })
  }
  for (const id of ['object', 'plant', 'thumbnail', 'market', 'neat', 'art', 'snack', 'desk', 'match']) {
    const preset = experiments.find(item => item.id === id)!
    fixtures.push({ id, state: preset.state, questions: rules(preset.questions, preset.rules), image: await image(preset.sample), ...(preset.reference ? { expected: { [preset.reference.question]: preset.reference.label } } : {}) })
  }
  const questions: Questions = {
    action: { type: 'choice', instructions: 'Approve only when amount is at most 100 and status is paid. Otherwise reject.', criteria: { approve: 'Amount at most 100 and payment status paid.', reject: 'Amount exceeds 100 or payment status is not paid.' } },
    paid: { type: 'noul', instructions: 'Is the stated payment status paid?' },
    urgency: { type: 'score', instructions: 'Classify the explicitly stated urgency.', criteria: ['Low urgency', 'Medium urgency', 'High urgency'] },
  }
  fixtures.push({ id: 'json-approve', state: { amount: 42, status: 'paid', urgency: 'low' }, questions, expected: { action: 'approve', paid: 'yes', urgency: '0' } })
  fixtures.push({ id: 'json-reject', state: { amount: 150, status: 'unpaid', urgency: 'high' }, questions, expected: { action: 'reject', paid: 'no', urgency: '2' } })
  fixtures.push({ id: 'text-approve', state: 'The amount is 42. Payment status: paid. Urgency: medium.', questions, expected: { action: 'approve', paid: 'yes', urgency: '1' } })
  fixtures.push({ id: 'text-reject', state: 'The amount is 150. Payment status: paid. Urgency: high.', questions, expected: { action: 'reject', paid: 'yes', urgency: '2' } })
  await writeFile(`${directory}/suite.json`, JSON.stringify({ version: 1, max_tokens: 4096, max_pixels: 262144, fixtures }, null, 2))
  console.log(`Prepared ${fixtures.length} identical inputs in ${directory}/suite.json; no personal uploads included.`)
} finally { await browser.close() }
