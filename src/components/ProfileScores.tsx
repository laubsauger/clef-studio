import { ChartNoAxesCombined, LoaderCircle, Pause, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { profileScores } from '@/lib/profile-scores'
import type { QueueItem } from '@/lib/use-image-queue'

export function ProfileScores({ items, question, onSelect, selectedId, running, ready, busy, onRun, onPause }: { items: QueueItem[]; question: string; onSelect: (id: string) => void; selectedId: string; running: boolean; ready: boolean; busy: boolean; onRun: () => void; onPause: () => void }) {
  const summary = profileScores(items, question)
  return <section className="profile-scores" aria-label="Combined profile scores">
    <div className="profile-score-heading"><span><ChartNoAxesCombined size={13} />{summary.complete ? 'COMBINED SCORE' : 'PHOTO SCORES'}<small>{summary.scores.length}/{items.length} scored</small></span><strong>{summary.total === undefined ? '—' : summary.total.toFixed(1)}<small>/100</small></strong></div>
    <div className="profile-photo-grid">{items.map((item, i) => { const score = summary.scores.find(score => score.id === item.id); return <button className={item.id === selectedId ? 'selected' : ''} key={item.id} onClick={() => onSelect(item.id)} aria-label={`Review photo ${i + 1} score`} aria-pressed={item.id === selectedId} title={item.error || item.name}><img src={item.image} alt={`Profile photo ${i + 1}`} /><span><small>{String(i + 1).padStart(2, '0')}</small><strong>{score ? score.score.toFixed(1) : item.status === 'running' ? <LoaderCircle className="ocr-spinner" size={12} /> : item.status === 'error' ? 'Error' : 'Queued'}</strong></span></button> })}</div>
    <Button variant="secondary" size="sm" className="profile-score-run" disabled={!running && (!ready || busy || summary.complete)} onClick={running ? onPause : onRun}>{running ? <Pause size={12} /> : <Play size={12} />}{running ? 'Pause scoring' : summary.complete ? 'All photos scored' : 'Score all photos'}</Button>
    <p>Median of all photo attraction scores · less sensitive to one outlier.{summary.complete && ` Range ${summary.minimum!.toFixed(1)}–${summary.maximum!.toFixed(1)}.`}</p>
  </section>
}
