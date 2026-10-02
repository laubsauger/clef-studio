import { ArrowUpRight, Clock3, Download, FlaskConical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Run } from '@/lib/experiments'
import { winning } from '@/lib/experiments'
import { download } from '@/lib/media'

export function History({ runs, onSelect }: { runs: Run[]; onSelect: (run: Run) => void }) {
  return <section className="history-view"><div className="section-title"><div><span className="eyebrow">SESSION</span><h2>Run history</h2><p>This session’s decisions, criteria, and your feedback.</p></div><Button variant="outline" disabled={!runs.length} onClick={() => download(new Blob([JSON.stringify(runs, null, 2)], { type: 'application/json' }), 'clef-session.json')}><Download size={16} />Export session</Button></div>
    {!runs.length ? <div className="empty-history"><FlaskConical size={32} strokeWidth={1.3} /><h3>No decisions yet.</h3><p>Run an experiment and its result will appear here.</p></div> : <div className="history-list">{runs.map(run => {
      const winner = winning(Object.values(run.result.answers)[0])
      return <button className="history-row" key={run.id} onClick={() => onSelect(run)}><span className="history-icon"><Clock3 size={19} /></span><div><strong>{run.title}{run.filename && <span className="history-filename"> · {run.filename}</span>}</strong><span>{new Date(run.result.timestamp).toLocaleTimeString()} · {run.result.model} · {run.result.provider}</span></div><span className="history-verdict">{winner.label}</span><strong>{(winner.probability * 100).toFixed(1)}%</strong><span className="history-latency">{(run.result.latency_ms / 1000).toFixed(2)}s</span><ArrowUpRight size={17} /></button>
    })}</div>}
    <p className="session-note">Kept in memory for this session. Export before refreshing. Images are excluded from the log.</p>
  </section>
}
