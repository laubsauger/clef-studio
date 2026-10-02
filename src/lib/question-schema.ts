import { z } from 'zod'
const instructions = z.string().trim().min(1).max(12000)
export const questionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('choice'), instructions, criteria: z.record(z.string().min(1).max(100), z.string().max(4000)).refine(c => Object.keys(c).length >= 2 && Object.keys(c).length <= 255, 'Provide 2–255 options') }).strict(),
  z.object({ type: z.literal('noul'), instructions }).strict(),
  z.object({ type: z.literal('score'), instructions, criteria: z.array(z.string().min(1).max(4000)).min(2).max(10) }).strict(),
])
export const questionsSchema = z.record(z.string().regex(/^[a-zA-Z0-9_.-]{1,100}$/), questionSchema).refine(q => Object.keys(q).length >= 1 && Object.keys(q).length <= 64, 'Provide 1–64 questions')
export function parseQuestions(text: string): { questions?: z.infer<typeof questionsSchema>; issues: { path: string; message: string }[] } {
  try {
    const result = questionsSchema.safeParse(JSON.parse(text))
    if (!result.success) return { issues: result.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })) }
    return { questions: result.data, issues: [] }
  } catch (error) { return { issues: [{ path: 'JSON', message: error instanceof Error ? error.message : 'Invalid JSON' }] } }
}
