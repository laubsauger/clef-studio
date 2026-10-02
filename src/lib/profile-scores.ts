import type { QueueItem } from './use-image-queue'

export function profileScores(items: QueueItem[], question: string) {
  const scores = items.filter(item => item.status === 'done' && item.run).map(item => {
    const answer = item.run!.result.answers[question], schema = item.run!.questions[question]
    if (answer?.type !== 'score' || schema?.type !== 'score' || schema.criteria.length < 2) throw new Error('Photo scoring requires a score answer and an ordered rubric.')
    return { id: item.id, name: item.name, score: answer.score / (schema.criteria.length - 1) * 100 }
  })
  const sorted = scores.map(item => item.score).sort((a, b) => a - b)
  const complete = items.length > 0 && scores.length === items.length
  const middle = Math.floor(sorted.length / 2)
  return { scores, complete, total: complete ? sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2 : undefined, minimum: sorted[0], maximum: sorted.at(-1) }
}
