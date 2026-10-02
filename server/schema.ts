import { z } from 'zod'

import { questionsSchema } from '../src/lib/question-schema.ts'

export const decisionSchema = z.object({
  provider: z.enum(['local', 'cloudflare']),
  experiment: z.string().max(100).optional(),
  model: z.enum(['clef', 'clef-flash']),
  state: z.json().refine(v => JSON.stringify(v).length <= 24000, 'State exceeds 24,000 characters.'),
  questions: questionsSchema,
  images: z.array(z.string().regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/)).max(4),
}).superRefine((v, ctx) => {
  if (v.provider === 'local' && v.model !== 'clef-flash') ctx.addIssue({ code: 'custom', message: 'The M3 runtime supports Clef-flash only.' })
  let total = 0
  for (const img of v.images) {
    const payload = img.split(',')[1]
    if (!payload) { ctx.addIssue({ code: 'custom', message: 'Image must contain embedded base64 bytes.' }); continue }
    const bytes = Buffer.byteLength(payload, 'base64')
    total += bytes
    if (bytes > 4 * 1024 * 1024) ctx.addIssue({ code: 'custom', message: 'Image exceeds 4 MiB.' })
  }
  if (total > 8 * 1024 * 1024) ctx.addIssue({ code: 'custom', message: 'Images exceed 8 MiB total.' })
  if (typeof v.state === 'string' && !v.state.trim() && !v.images.length) ctx.addIssue({ code: 'custom', message: 'Add an image or some context first.' })
})

const probability = z.number().finite().min(0).max(1)
const answer = z.discriminatedUnion('type', [
  z.object({ type: z.literal('choice'), choice: z.string(), confidence: probability, probabilities: z.record(z.string(), probability) }),
  z.object({ type: z.literal('noul'), noul: probability }),
  z.object({ type: z.literal('score'), score: z.number().finite(), confidence: probability, legend: z.record(z.string(), z.string()), probabilities: z.record(z.string(), probability) }),
])
export const responseSchema = z.object({ model: z.string(), answers: z.record(z.string(), answer), usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }), inference_ms: z.number().nonnegative().optional(), vision: z.object({ input_sizes: z.array(z.object({ width: z.number().positive(), height: z.number().positive() })), max_pixels: z.number().positive() }).optional() })

export function validateResponse(raw: unknown, questions: z.infer<typeof decisionSchema>['questions']) {
  const result = responseSchema.parse(raw)
  for (const [id, q] of Object.entries(questions)) {
    const a = result.answers[id]
    if (!a || a.type !== q.type) throw new Error(`Invalid model answer for ${id}`)
    if (a.type === 'choice' && q.type === 'choice') {
      if (!(a.choice in q.criteria) || Object.keys(a.probabilities).sort().join('|') !== Object.keys(q.criteria).sort().join('|')) throw new Error(`Model returned unknown or missing options for ${id}`)
    }
    if (a.type === 'score' && q.type === 'score') {
      if (a.score < 0 || a.score > q.criteria.length - 1 || Object.keys(a.probabilities).sort().join('|') !== q.criteria.map((_, i) => String(i)).sort().join('|')) throw new Error(`Invalid score for ${id}`)
    }
  }
  return result
}
