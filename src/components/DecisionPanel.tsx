import { Activity, Gauge, ListChecks, Check, Download, Loader2, Sparkles, ThumbsDown, ThumbsUp, Zap, Braces, ChevronDown, CheckCircle2, XCircle, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { options, winning } from '@/lib/experiments'
import type { Answer, Decision, Question, Questions, Reference, Run } from '@/lib/experiments'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'

function AnimatedPercent({ probability }: { probability: number }) {
  const value = useMotionValue(0)
  const display = useTransform(value, v => v.toFixed(1))
  const reduced = useReducedMotion()
  useEffect(() => {
    const animation = animate(value, probability * 100, { duration: reduced ? 0 : 0.65, ease: [0.2, 0.8, 0.2, 1] })
    return () => animation.stop()
  }, [probability, value, reduced])
  return <motion.span className="animated-percent">{display}</motion.span>
}

function SecondaryAnswer({ id, question, answer }: { id: string; question: Question; answer?: Answer }) {
  const label = id.replaceAll('_', ' ')
  const Icon = question.type === 'noul' ? Activity : question.type === 'score' ? Gauge : ListChecks
  const yes = answer?.type === 'noul' && answer.noul >= 0.5
  const outcome = answer?.type === 'noul' ? yes ? 'Yes' : 'No' : answer?.type === 'choice' ? answer.choice.replaceAll('_', ' ') : undefined
  const value = answer?.type === 'noul' ? yes ? answer.noul : 1 - answer.noul : answer?.type === 'score' ? answer.score : answer?.type === 'choice' ? answer.confidence : undefined
  const maximum = question.type === 'score' ? question.criteria.length - 1 : 1
  return <div className={`extra-answer ${answer?.type === 'noul' && !yes ? 'answer-no' : ''}`} title={question.instructions}>
    <div className="secondary-answer-heading"><span><Icon size={13} />{label}</span><strong>{answer ? <>{outcome && <span className="secondary-outcome">{outcome}</span>}<span>{answer.type === 'score' ? `${answer.score.toFixed(2)} / ${maximum}` : `${(value! * 100).toFixed(1)}%`}</span></> : <span className="secondary-pending">—</span>}</strong></div>
    <div className="secondary-meter" role={answer ? 'meter' : undefined} aria-label={`${label}: ${question.type === 'score' ? 'score' : `probability of ${outcome ?? 'answer'}`}`} aria-valuemin={answer ? 0 : undefined} aria-valuemax={answer ? maximum : undefined} aria-valuenow={value} aria-valuetext={answer ? question.type === 'score' ? `${value} out of ${maximum}` : `${(value! * 100).toFixed(1)}% ${outcome}` : undefined}><motion.span style={{ width: '100%', transformOrigin: 'left' }} initial={{ scaleX: 0 }} animate={{ scaleX: value === undefined ? 0 : value / maximum }} transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }} /></div>
  </div>
}

type Props = { result?: Decision; questions: Questions; busy: boolean; ready: boolean; onDecide: () => void; onExport: () => void; feedback?: string; onFeedback: (value: 'agree' | 'disagree') => void; status: string; controls: ReactNode; reference?: Reference; validationRuns: Run[]; activeDecision?: { experiment: string; startedAt: string } }
export function DecisionPanel({ result, questions, busy, ready, onDecide, onExport, feedback, onFeedback, status, controls, reference, validationRuns, activeDecision }: Props) {
  const primaryId = Object.keys(questions)[0]
  const answer = result?.answers[primaryId]
  const winner = answer ? winning(answer) : undefined
  const question = questions[primaryId]
  const candidates = answer ? options(answer) : (question?.type === 'choice' ? Object.keys(question.criteria) : question?.type === 'noul' ? ['yes', 'no'] : question?.type === 'score' ? question.criteria : []).map(label => ({ label, probability: undefined }))
  const expectedAnswer = reference ? result?.answers[reference.question] : undefined
  const correct = expectedAnswer?.type === 'choice' && expectedAnswer.choice === reference?.label
  const checkedRuns = validationRuns.filter(r => r.result.answers[r.reference!.question]?.type === 'choice')
  const correctCount = checkedRuns.filter(r => { const a = r.result.answers[r.reference!.question]; return a.type === 'choice' && a.choice === r.reference!.label }).length
  const [elapsed, setElapsed] = useState(0)
  const activeStartedAt = activeDecision?.startedAt
  useEffect(() => {
    if (!busy && !activeStartedAt) return
    const start = activeStartedAt ? Date.parse(activeStartedAt) : Date.now()
    const timer = setInterval(() => setElapsed(Math.max(0, (Date.now() - start) / 1000)), 100)
    return () => clearInterval(timer)
  }, [busy, activeStartedAt])
  return <section className={`decision-panel ${busy ? 'is-thinking' : ''}`} aria-label="Decision output">
    <AnimatePresence>{busy && <motion.div className="inference-progress" role="progressbar" aria-label="Inference in progress" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><span /></motion.div>}</AnimatePresence>
    <div className="panel-heading"><span><Zap size={16} /> DECISION</span><span className="decision-pass">{busy ? `${elapsed.toFixed(1)}s ELAPSED` : activeDecision ? 'GPU BUSY' : result ? `COMPLETE · ${(result.latency_ms / 1000).toFixed(2)}s · ${result.usage.input_tokens.toLocaleString()} tokens` : 'IDLE'}</span></div>
    <div className="decision-body">
      <div className="decision-summary"><div className="decision-summary-copy"><div className="decision-kicker"><div className="decision-symbol">{busy || activeDecision ? <Loader2 className="spin" size={18} /> : result ? <Check size={18} /> : <Sparkles size={18} />}</div><span className="eyebrow">{busy ? 'EVALUATING INPUT' : activeDecision ? 'ANOTHER DECISION IS RUNNING' : result ? 'MODEL CHOICE' : 'READY'}</span></div>
      <AnimatePresence mode="wait" initial={false}><motion.h3 key={busy ? 'busy' : activeDecision ? 'occupied' : winner?.label ?? 'idle'} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: 0.16 }} className={`verdict ${result ? 'has-verdict' : ''}`}>{busy ? 'Evaluating…' : activeDecision ? activeDecision.experiment : winner ? winner.label.replaceAll('_', ' ') : 'Ready to evaluate'}</motion.h3></AnimatePresence>
      <p className="decision-caption">{busy ? 'Scoring the current input.' : activeDecision ? `Running for ${elapsed.toFixed(0)}s. Available when it finishes.` : result ? 'Scored against your rules.' : 'Set your rules and run a decision.'}</p></div>
      <div className="probability-large">{winner ? <AnimatedPercent probability={winner.probability} /> : <span className="probability-placeholder">—</span>}<span>{winner ? '%' : ''}</span><small>PROBABILITY</small></div></div>
      <div className={`probabilities ${candidates.length > 5 ? 'many-options' : ''}`} aria-live="polite">{candidates.map(({ label, probability }, i) => <div className={`probability-row ${winner?.label === label ? 'selected' : ''}`} key={label}><div><span className="option-index">0{i + 1}</span><span>{label.replaceAll('_', ' ')}</span><strong>{probability === undefined ? '—' : `${(probability * 100).toFixed(1)}%`}</strong></div><div className="probability-track"><motion.span style={{ width: '100%', transformOrigin: 'left' }} initial={{ scaleX: 0 }} animate={{ scaleX: probability ?? 0 }} transition={{ duration: 0.55, delay: i * 0.045, ease: [0.2, 0.8, 0.2, 1] }} /></div></div>)}</div>
      {Object.keys(questions).filter(id => id !== primaryId).map(id => <SecondaryAnswer key={id} id={id} question={questions[id]} answer={result?.answers[id]} />)}

      {reference && <div className={`reference-result ${expectedAnswer ? correct ? 'correct' : 'incorrect' : ''}`}><div><Target size={14} /><span>Expected</span><strong>{reference.label}</strong>{expectedAnswer && (correct ? <CheckCircle2 size={15} /> : <XCircle size={15} />)}</div>{expectedAnswer && <p>{correct ? 'Correct' : 'Incorrect'} · {correctCount}/{checkedRuns.length} correct across known fixtures this session</p>}</div>}
      {result && <div className="result-tools"><details className="debug-response"><summary><Braces size={13} />Inspect response<span>JSON</span><ChevronDown size={13} /></summary><div className="debug-metrics"><span>Provider<strong>{result.provider}</strong></span><span>Model<strong>{result.model}</strong></span><span>Output tokens<strong>{result.usage.output_tokens}</strong></span>{result.inference_ms !== undefined && <span>GPU inference<strong>{(result.inference_ms / 1000).toFixed(2)}s</strong></span>}{result.vision && <><span>Input image<strong>{result.vision.input_sizes.map(size => `${size.width}×${size.height}`).join(', ') || 'None'}</strong></span><span>Vision budget<strong>{result.vision.max_pixels.toLocaleString()} pixels</strong></span></>}</div><pre>{JSON.stringify(result, null, 2)}</pre><Button size="xs" variant="ghost" onClick={() => { navigator.clipboard.writeText(JSON.stringify(result, null, 2)) }}>Copy JSON</Button></details><Button aria-label="Agree with decision" variant={feedback === 'agree' ? 'secondary' : 'ghost'} size="icon-sm" onClick={() => onFeedback('agree')}><ThumbsUp size={14} /></Button><Button aria-label="Disagree with decision" variant={feedback === 'disagree' ? 'secondary' : 'ghost'} size="icon-sm" onClick={() => onFeedback('disagree')}><ThumbsDown size={14} /></Button><Button size="icon-sm" variant="ghost" onClick={onExport} aria-label="Export result card"><Download size={14} /></Button></div>}
    </div>
    <div className="decision-actions"><Button className="decide-button" disabled={busy || !ready} onClick={onDecide}>{busy ? <Loader2 className="spin" /> : <Zap size={17} />}{busy ? 'Running decision' : activeDecision ? 'Waiting for GPU' : result ? 'Run again' : 'Make a decision'}<span className="key-hint">↵</span></Button>
      {!ready && !activeDecision && <p className="runtime-note">{status}</p>}
    </div>
    {controls}
  </section>
}
