import { Check, ChevronLeft, ChevronRight, Images, Loader2, Pause, Play, Plus, X, AlertCircle } from 'lucide-react'
import { Button } from './ui/button'
import type { ImageQueueState } from '@/lib/use-image-queue'
import { winning } from '@/lib/experiments'

type Props = { queue: ImageQueueState; active: boolean; running: boolean; busy: boolean; ready: boolean; adding: boolean; onSelect: (id: string) => void; onRun: () => void; onPause: () => void; onAdd: () => void; onClear: () => void }
export function ImageQueue({ queue, active, running, busy, ready, adding, onSelect, onRun, onPause, onAdd, onClear }: Props) {
  const index = queue.items.findIndex(item => item.id === queue.selectedId)
  const done = queue.items.filter(item => item.status === 'done').length
  const remaining = queue.items.filter(item => item.status === 'pending' || item.status === 'error').length
  const selected = queue.items[index]
  return <div className="image-queue" role="region" aria-label="Image queue">
    <div className="queue-heading"><Images size={14} /><strong>{selected.name}</strong><span>{index + 1} / {queue.items.length}</span><Button variant="ghost" size="icon-xs" aria-label="Previous queued image" disabled={running || index === 0} onClick={() => onSelect(queue.items[index - 1].id)}><ChevronLeft size={14} /></Button><Button variant="ghost" size="icon-xs" aria-label="Next queued image" disabled={running || index === queue.items.length - 1} onClick={() => onSelect(queue.items[index + 1].id)}><ChevronRight size={14} /></Button><Button variant="ghost" size="icon-xs" aria-label="Clear image queue" disabled={busy || running || adding} onClick={onClear}><X size={13} /></Button></div>
    <div className="queue-strip">{queue.items.map((item, i) => {
      const answer = item.run && Object.values(item.run.result.answers)[0]
      return <button className={`queue-thumbnail ${active && item.id === queue.selectedId ? 'selected' : ''} ${item.status}`} key={item.id} aria-label={`Queue image ${i + 1}: ${item.name}`} aria-pressed={active && item.id === queue.selectedId} disabled={running} title={item.error || (answer ? `${item.name} · ${winning(answer).label}` : item.name)} onClick={() => onSelect(item.id)}><img src={item.image} alt="" /><span className="queue-item-number">{i + 1}</span>{item.status === 'done' ? <Check className="queue-item-status" size={12} /> : item.status === 'running' ? <Loader2 className="queue-item-status spin" size={12} /> : item.status === 'error' ? <AlertCircle className="queue-item-status" size={12} /> : null}</button>
    })}<Button variant="outline" size="icon-sm" className="queue-add" aria-label="Add images to queue" disabled={adding || running} onClick={onAdd}><Plus size={16} /></Button></div>
    <div className="queue-footer"><span role="status">{running ? 'Processing' : done === queue.items.length ? 'Complete' : 'Ready'} · {done}/{queue.items.length} done</span><div className="queue-progress" aria-hidden="true"><span style={{ width: `${done / queue.items.length * 100}%` }} /></div><Button variant={running ? 'secondary' : 'outline'} size="sm" disabled={!running && (!ready || busy || adding || !remaining)} onClick={running ? onPause : onRun}>{running ? <Pause size={12} /> : <Play size={12} />}{running ? 'Pause queue' : 'Run queue'}</Button></div>
  </div>
}
