import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, ArrowUpRight, Check, ChevronRight, Clapperboard, Code2, Database, Scale, FlaskConical, Heart, HelpCircle, History as HistoryIcon, Leaf, Camera, Pizza, Palette, Paintbrush, Presentation, Box, Laptop, Maximize2, Monitor, Pause, Play, Plus, Settings2, Sparkles, Square, ScanText, LoaderCircle, Video, X, Zap, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { MediaInput } from '@/components/MediaInput'
import type { MediaHandle } from '@/components/MediaInput'
import { SchemaEditor } from '@/components/SchemaEditor'
import { AndroidProfileCapture } from '@/components/AndroidProfileCapture'
import type { ProfileCollection } from '@/lib/android-profile'
import { androidStep, cancelAndroid, collectAndroidProfile, immediateAndroidProfile } from '@/lib/android-profile'
import { ProfileOCRPanel } from '@/components/ProfileOCRPanel'
import { ProfileScores } from '@/components/ProfileScores'
import { profileScores } from '@/lib/profile-scores'
import { PhoneCaptureGuide } from '@/components/PhoneCaptureGuide'
import { DecisionPanel } from '@/components/DecisionPanel'
import { ImageQueue } from '@/components/ImageQueue'
import { useImageQueue } from '@/lib/use-image-queue'
import type { QueueItem } from '@/lib/use-image-queue'
import { History } from '@/components/History'
import { experiments, winning } from '@/lib/experiments'
import type { Decision, Questions, Run, Reference } from '@/lib/experiments'
import { download, fileImage, imageData, loadImage, shareCard } from '@/lib/media'
import { readProfileText } from '@/lib/profile-ocr'
import { AnimatePresence, motion, MotionConfig } from 'motion/react'
import './App.css'
import './profile-ocr.css'

type ActiveDecision = { id: string; experiment: string; provider: string; startedAt: string }
type Status = { local: { status: string; error?: string; activeDecision?: ActiveDecision | null }; activeDecision?: ActiveDecision | null; ocr?: { available: boolean; engine: string }; cloudflare: { configured: boolean } }
type Settings = { state: string; rules: string; format: 'text' | 'json'; questions: Questions }
const icons: Record<string, typeof Heart> = { match: Heart, thumbnail: Clapperboard, market: Sparkles, neat: Presentation, ui: Monitor, custom: Plus, plant: Leaf, fit: Heart, snack: Pizza, art: Paintbrush, desk: Monitor, 'profile-facts': Camera, color: Palette, object: Box }
const navExperiments = experiments.filter(e => e.id !== 'custom')
const initialSettings = Object.fromEntries(experiments.map(e => [e.id, { state: e.state, rules: e.rules, format: 'text' as const, questions: e.questions }]))

export default function App() {
  const [selected, setSelected] = useState('match')
  const [view, setView] = useState<'studio' | 'history'>('studio')
  const [settings, setSettings] = useState<Record<string, Settings>>(initialSettings)
  const { queues, append: appendQueue, select: selectQueue, update: updateQueue, invalidate: invalidateQueue, clear: clearQueue } = useImageQueue()
  const [queueRunning, setQueueRunning] = useState(false)
  const [addingImages, setAddingImages] = useState(false)
  const [readingProfile, setReadingProfile] = useState(false)
  const readingProfileRef = useRef(false)
  const [profileOCR, setProfileOCR] = useState(false)
  const [profileEvidence, setProfileEvidence] = useState<{ profileText: string; ignoredText: string; engine?: string }>()
  const [androidSerial, setAndroidSerial] = useState('')
  const [imageOCRSource, setImageOCRSource] = useState(false)
  const [phoneProfile, setPhoneProfile] = useState<{ name: string; age: number }>()
  const [capturedIdentity, setCapturedIdentity] = useState<{ name: string; age: number }>()
  const [profileMode, setProfileMode] = useState<'immediate' | 'full'>('full')
  const [profileReadProgress, setProfileReadProgress] = useState('')
  const [capturedProfilePhotos, setCapturedProfilePhotos] = useState<(string | undefined)[]>([])
  const capturedPhotosRef = useRef<(string | undefined)[]>([])
  const [profileCaptureFrame, setProfileCaptureFrame] = useState<string>()
  const [profileSession, setProfileSession] = useState<{ experiment: string; ids: string[] }>()
  const stopProfileRead = useRef(false)
  const importingImages = useRef(false)
  const [provider, setProvider] = useState<'local' | 'cloudflare'>('local')
  const [model, setModel] = useState<'clef' | 'clef-flash'>('clef-flash')
  const [status, setStatus] = useState<Status>()
  const [result, setResult] = useState<Decision>()
  const [runs, setRuns] = useState<Run[]>([])
  const [currentRun, setCurrentRun] = useState<string>()
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [error, setError] = useState('')
  const busyConflict = useRef(false)
  const [notice, setNotice] = useState('')
  const [kind, setKind] = useState('sample')
  const [reference, setReference] = useState<Reference>()
  const [continuous, setContinuous] = useState(false)
  const [intervalSeconds, setIntervalSeconds] = useState(5)
  const [focus, setFocus] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [portrait, setPortrait] = useState(false)
  const [dialog, setDialog] = useState<'settings' | 'schema' | 'phone' | 'result' | 'profile-text' | 'android-profile'>()
  const [schemaDraft, setSchemaDraft] = useState('')
  const [schemaError, setSchemaError] = useState('')
  const [schemaSaving, setSchemaSaving] = useState(false)
  const [recording, setRecording] = useState(false)
  const recorder = useRef<MediaRecorder | undefined>(undefined)
  const recordingStream = useRef<MediaStream | undefined>(undefined)
  const media = useRef<MediaHandle>(null)
  const lastFrame = useRef<string | undefined>(undefined)
  const generation = useRef(0)
  const experiment = experiments.find(e => e.id === selected)!
  const storedConfig = settings[selected]
  const fullProfile = profileSession?.experiment === selected
  const attractionQuestion = experiments.find(item => item.id === 'fit')!.questions.attraction
  const config = useMemo(() => fullProfile && selected === 'match' ? { ...storedConfig, questions: { ...storedConfig.questions, photo_attraction: attractionQuestion } } : storedConfig, [fullProfile, selected, storedConfig, attractionQuestion])
  const queue = queues[selected]
  const queuedItem = kind === 'queue' ? queue?.items.find(item => item.id === queue.selectedId) : undefined
  const activeDecision = status?.activeDecision ?? status?.local.activeDecision
  const occupied = Boolean(activeDecision) && !busy
  const engineReady = provider === 'local' ? status?.local.status === 'ready' : Boolean(status?.cloudflare.configured)
  const ready = engineReady && !occupied && !addingImages && !readingProfile
  const statusText = !status ? 'Checking runtime…' : provider === 'cloudflare' ? status.cloudflare.configured ? 'Cloudflare connected' : 'Cloudflare credentials needed' : status.local.status === 'ready' ? 'Local GPU ready' : status.local.status === 'loading' ? 'Loading weights on MPS…' : status.local.status === 'error' ? 'Local runtime needs attention' : 'Local runtime offline'

  useEffect(() => {
    let alive = true
    async function poll() {
      try {
        const response = await fetch('/api/status', { signal: AbortSignal.timeout(4000) })
        if (!response.ok) throw new Error('Local API unavailable')
        const next: Status = await response.json()
        if (alive) setStatus(next)
      } catch { if (alive) setStatus({ local: { status: 'offline', error: 'Could not reach the local API. Run npm run dev.' }, cloudflare: { configured: false } }) }
    }
    void poll(); const timer = setInterval(() => void poll(), 5000)
    return () => { alive = false; clearInterval(timer) }
  }, [])
  useEffect(() => {
    if (!androidSerial || selected !== 'match') return
    let alive = true, pending = false
    async function check() {
      if (pending || readingProfileRef.current) return
      pending = true
      try {
        const response = await fetch(`/api/android/profile-identity?serial=${encodeURIComponent(androidSerial)}`, { signal: AbortSignal.timeout(6000) })
        if (!response.ok) throw new Error('Could not read the connected profile identity.')
        const body = await response.json()
        if (alive && body.available) setPhoneProfile(body.profile)
      } catch { /* Detection never replaces State; explicit capture reports connection errors. */ }
      finally { pending = false }
    }
    void check(); const timer = setInterval(() => void check(), 2500)
    return () => { alive = false; clearInterval(timer) }
  }, [androidSerial, selected])
  useEffect(() => {
    if (androidSerial || imageOCRSource) return
    let alive = true
    let pending = false
    async function discover() {
      if (pending) return
      pending = true
      try {
        const response = await fetch('/api/android/devices', { signal: AbortSignal.timeout(4000) })
        if (!response.ok) return
        const { devices } = await response.json()
        const authorized = devices.filter((device: { state: string }) => device.state === 'device')
        if (alive && authorized.length === 1) setAndroidSerial(authorized[0].serial)
      } catch { /* Device discovery retries; explicit connection reports API errors in the picker. */ }
      finally { pending = false }
    }
    void discover(); const timer = setInterval(() => void discover(), 3000)
    return () => { alive = false; clearInterval(timer) }
  }, [androidSerial, imageOCRSource])
  useEffect(() => () => { stopProfileRead.current = true }, [])
  useEffect(() => {
    if (status && !activeDecision && !busy && busyConflict.current) { busyConflict.current = false; setError('') }
  }, [status, activeDecision, busy])
  useEffect(() => () => { if (recorder.current?.state === 'recording') recorder.current.stop(); recordingStream.current?.getTracks().forEach(t => t.stop()) }, [])
  function resetResult() { setQueueRunning(false); setContinuous(false); generation.current++; setResult(undefined); setCurrentRun(undefined); lastFrame.current = undefined }
  function choose(id: string) {
    resetResult(); setProfileEvidence(undefined); setSelected(id); setView('studio'); setError('')
    const savedQueue = queues[id]
    const item = savedQueue?.items.find(entry => entry.id === savedQueue.selectedId)
    if (item) { setKind('queue'); setReference(undefined); setResult(item.run?.result); setCurrentRun(item.run?.id); lastFrame.current = item.image }
  }
  function chooseQueueImage(id: string, automatic = false) {
    if (!automatic) setQueueRunning(false)
    if (profileSession?.experiment !== selected) setProfileEvidence(undefined)
    setContinuous(false); generation.current++; selectQueue(selected, id); setKind('queue'); setReference(undefined); setError('')
    const item = queue!.items.find(entry => entry.id === id)!
    setResult(item.run?.result); setCurrentRun(item.run?.id); lastFrame.current = item.image
    if (selected === 'match' && profileOCR && item.run) setSettings(previous => ({ ...previous, [selected]: { ...previous[selected], state: item.run!.state, format: item.run!.format } }))
  }
  async function addImages(files: File[]) {
    if (importingImages.current) return
    if ((queue?.items.length ?? 0) + files.length > 100) throw new Error('Each experiment can hold up to 100 images. Clear this queue before adding another batch.')
    const target = selected, ticket = generation.current
    setProfileSession(undefined)
    importingImages.current = true; setAddingImages(true); setQueueRunning(false); setContinuous(false)
    try {
      const items: QueueItem[] = []
      for (const file of files) {
        try { items.push({ id: crypto.randomUUID(), name: file.name, image: await fileImage(file), status: 'pending' }) }
        catch (error) { throw new Error(`${file.name}: ${error instanceof Error ? error.message : 'Could not load image.'}`) }
      }
      appendQueue(target, items)
      if (generation.current === ticket) { generation.current++; setKind('queue'); setReference(undefined); setResult(undefined); setCurrentRun(undefined); lastFrame.current = undefined; setError('') }
    } finally { importingImages.current = false; setAddingImages(false) }
  }
  const inputChanged = useCallback((next: string, expected?: Reference) => { setKind(next); setReference(expected); setProfileEvidence(undefined); setProfileSession(undefined); setContinuous(false); setQueueRunning(false); generation.current++; setResult(undefined); setCurrentRun(undefined); lastFrame.current = undefined }, [])
  async function importProfileCollection(collection: ProfileCollection, target: 'match' | 'fit', run = target === 'fit', full = true) {
    if (busyRef.current || importingImages.current) throw new Error('Wait for the current operation before importing a profile.')
    importingImages.current = true
    setAddingImages(true)
    try {
      const images = []
      for (const photo of collection.photos) { const image = await loadImage(photo); images.push(await imageData(image, image.width, image.height)) }
      const state = JSON.stringify(collection.text.profile, null, 2)
      let targetIds: string[] = []
      for (const id of ['match', 'fit']) {
        clearQueue(id)
        const items: QueueItem[] = images.map((image, index) => ({ id: crypto.randomUUID(), name: `${collection.text.profile.name} · photo ${index + 1}`, image, status: 'pending' }))
        appendQueue(id, items)
        if (id === target) targetIds = items.map(item => item.id)
      }
      setSettings(previous => ({ ...previous, match: { ...previous.match, state, format: 'json' }, fit: { ...previous.fit, state, format: 'json' } }))
      resetResult(); setSelected(target); setView('studio'); setKind('queue'); setReference(undefined); setError(''); setProfileOCR(false); setProfileEvidence({ ...collection.text, engine: 'Android accessibility' }); setDialog(undefined)
      setProfileSession(full ? { experiment: target, ids: targetIds } : undefined)
      if (run) setQueueRunning(true)
      setNotice(`${images.length} photos and profile details loaded${run ? ' · scoring queue' : ''}.`)
    } finally { importingImages.current = false; setAddingImages(false) }
  }
  async function captureProfileText(run = false) {
    if (busyRef.current || readingProfileRef.current || addingImages) return
    invalidateQueue(selected); resetResult(); setError('')
    const ticket = generation.current, target = selected
    stopProfileRead.current = false; capturedPhotosRef.current = []; setCapturedProfilePhotos([]); setProfileCaptureFrame(undefined); setProfileReadProgress('Reading the current profile…')
    readingProfileRef.current = true; setReadingProfile(true)
    try {
      if (androidSerial) {
        setProfileSession(undefined); clearQueue(target)
        const initial = await androidStep(androidSerial, 'capture')
        if (ticket !== generation.current || stopProfileRead.current) return
        setProfileCaptureFrame(initial.image)
        setCapturedIdentity(initial.profile); setPhoneProfile(initial.profile)
        const collection = profileMode === 'full' ? await collectAndroidProfile(initial, androidSerial, (message, frame, details) => { setProfileReadProgress(message); setProfileCaptureFrame(frame.image); setSettings(previous => ({ ...previous, [target]: { ...previous[target], state: JSON.stringify({ ...details.profile, photo_results: capturedPhotosRef.current.map((image, index) => ({ index: index + 1, status: image ? 'captured' : 'pending', score_100: null })) }, null, 2), format: 'json' } })); setProfileEvidence({ ...details, engine: 'Android accessibility' }) }, () => stopProfileRead.current || ticket !== generation.current, (image, index, count) => { const next = Array.from({ length: count }, (_, i) => capturedPhotosRef.current[i]); next[index] = image; capturedPhotosRef.current = next; setCapturedProfilePhotos(next) }) : immediateAndroidProfile(initial)
        if (ticket !== generation.current || stopProfileRead.current) return
        await importProfileCollection(collection, 'match', run, profileMode === 'full')
        setCapturedProfilePhotos([])
        return
      }
      const frame = await media.current!.capture({ refresh: true })
      if (!frame) throw new Error('Add a profile image or share the phone window first.')
      const extracted = await readProfileText(frame)
      if (ticket !== generation.current) return
      setSettings(previous => ({ ...previous, [target]: { ...previous[target], state: JSON.stringify(extracted.profile, null, 2), format: 'json' } }))
      setProfileEvidence(extracted)
      setProfileOCR(true)
      setNotice(`Profile text loaded · ${extracted.lines.length} lines · ${(extracted.recognition_ms / 1000).toFixed(2)}s`)
    } catch (error) { if (ticket === generation.current) { if (stopProfileRead.current) setNotice('Capture cancelled. No further phone input will be sent.'); else setError(error instanceof Error ? error.message : 'Profile text capture failed.') } }
    finally { readingProfileRef.current = false; setReadingProfile(false); setProfileReadProgress(''); setProfileCaptureFrame(undefined) }
  }
  async function stopAndroidCapture() {
    stopProfileRead.current = true; setProfileReadProgress('Cancelling phone capture…')
    try { const result = await cancelAndroid(androidSerial); setError(''); setNotice(result.cancelled ? 'Phone capture cancelled.' : 'No active phone command. Collection stopped.'); setProfileReadProgress('') }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not cancel Android capture.') }
  }
  function resetProfile() {
    resetResult(); clearQueue(selected); setProfileSession(undefined); setProfileEvidence(undefined); setCapturedIdentity(undefined); setCapturedProfilePhotos([]); capturedPhotosRef.current = []; setProfileOCR(false); setError('')
    setSettings(previous => ({ ...previous, [selected]: { ...previous[selected], state: '', format: 'text' } }))
    if (!media.current?.returnToLive()) media.current?.clear()
  }
  const decide = useCallback(async (forceOCR = false) => {
    const useOCR = experiment.id === 'match' && (profileOCR || forceOCR)
    if (busyRef.current || readingProfileRef.current || !ready) return
    busyRef.current = true; busyConflict.current = false; setBusy(true); setError('')
    const ticket = generation.current
    const queuedId = queuedItem?.id, queueRevision = queue?.revision
    if (queuedId) updateQueue(selected, queuedId, queueRevision!, { status: 'running', error: undefined })
    try {
      let state = config.format === 'json' ? JSON.parse(config.state) : config.state
      if (fullProfile && typeof state === 'object' && state) { delete state.photo_results; delete state.combined_photo_score }
      const questions = Object.fromEntries(Object.entries(config.questions).map(([id, question]) => [id, { ...question, instructions: `${question.instructions}\n\nDecision rules:\n${config.rules}` }]))
      const frame = await media.current?.capture()
      if (useOCR) {
        if (!frame) throw new Error('Profile OCR needs a visible image or captured phone frame.')
        const extracted = await readProfileText(frame)
        if (ticket !== generation.current) return
        state = extracted.profile
        if (forceOCR) setProfileOCR(true)
        setProfileEvidence(extracted)
        setSettings(previous => ({ ...previous, [experiment.id]: { ...previous[experiment.id], state: JSON.stringify(extracted.profile, null, 2), format: 'json' } }))
      }
      const response = await fetch('/api/decide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, model, experiment: experiment.short, state, questions, images: frame ? [frame] : [] }) })
      const data = await response.json()
      if (response.status === 429) busyConflict.current = true
      if (data.activeDecision) setStatus(previous => previous ? { ...previous, activeDecision: data.activeDecision } : previous)
      if (!response.ok) throw new Error(data.error || `Decision failed (${response.status}).`)
      const decision: Decision = data
      const run: Run = { id: crypto.randomUUID(), experiment: experiment.id, title: experiment.name, state: typeof state === 'string' ? state : JSON.stringify(state, null, 2), rules: config.rules, format: useOCR ? 'json' : config.format, questions: config.questions, reference, result: decision, ...(queuedItem ? { filename: queuedItem.name, queueItemId: queuedItem.id } : {}) }
      if (queuedId) updateQueue(experiment.id, queuedId, queueRevision!, { status: 'done', run, error: undefined })
      setRuns(previous => [run, ...previous].slice(0, 100))
      if (ticket === generation.current) { setResult(decision); setCurrentRun(run.id) }
    } catch (e) { const message = e instanceof Error ? e.message : 'Decision failed.'; setError(message); setContinuous(false); setQueueRunning(false); if (queuedId) updateQueue(experiment.id, queuedId, queueRevision!, { status: 'error', error: message }) }
    finally {
      busyRef.current = false; setBusy(false)
      const response = await fetch('/api/status', { signal: AbortSignal.timeout(4000) }).catch(() => undefined)
      if (response?.ok) setStatus(await response.json())
    }
  }, [ready, provider, model, config, experiment, reference, queuedItem, queue?.revision, selected, updateQueue, profileOCR, fullProfile])
  useEffect(() => {
    if (!profileSession) return
    const items = queues[profileSession.experiment]?.items.filter(item => profileSession.ids.includes(item.id))
    if (!items?.length) return
    const summary = profileScores(items, profileSession.experiment === 'match' ? 'photo_attraction' : 'attraction')
    setSettings(previous => {
      const current = previous[profileSession.experiment]
      if (current.format !== 'json') return previous
      let state: Record<string, unknown>
      try { state = JSON.parse(current.state) } catch { return previous /* Preserve an unfinished JSON edit; submission validates it. */ }
      const next = JSON.stringify({ ...state, photo_results: items.map((item, index) => ({ index: index + 1, status: item.status, score_100: summary.scores.find(score => score.id === item.id)?.score ?? null, answers: item.run?.result.answers ?? null })), combined_photo_score: { score_100: summary.total ?? null, method: 'median', complete: summary.complete } }, null, 2)
      return next === current.state ? previous : { ...previous, [profileSession.experiment]: { ...current, state: next } }
    })
  }, [profileSession, queues])
  useEffect(() => {
    if (!queueRunning || busy || !ready || !queue) return
    const next = queue.items.find(item => item.status === 'pending' || item.status === 'error')
    if (!next) { setQueueRunning(false); return }
    if (kind !== 'queue' || next.id !== queue.selectedId) { chooseQueueImage(next.id, true); return }
    void decide()
    // The selected media frame and request callback are refreshed before each sequential run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueRunning, busy, ready, queue, kind, decide])
  useEffect(() => {
    if (!continuous || busy || !ready) return
    const timer = setTimeout(() => void decide(), intervalSeconds * 1000)
    return () => clearTimeout(timer)
  }, [continuous, busy, ready, intervalSeconds, decide])
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if ((event.target instanceof HTMLElement && (event.target.matches('input,textarea,select') || event.target.isContentEditable)) || dialog) return
      if (event.key === 'Enter' && view === 'studio') { event.preventDefault(); void decide() }
      if (event.key.toLowerCase() === 'f') setFocus(f => !f)
      if (event.key === 'Escape') { setFocus(false); setContinuous(false); setQueueRunning(false) }
    }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key)
  }, [decide, dialog, view])
  function updateState(state: string) { if (selected === 'match') setProfileOCR(false); invalidateQueue(selected); resetResult(); setSettings(p => ({ ...p, [selected]: { ...p[selected], state } })) }
  function updateCriteria(id: string, option: string, value: string) {
    invalidateQueue(selected); resetResult(); setSettings(p => {
      const question = p[selected].questions[id]
      if (question.type !== 'choice') return p
      return { ...p, [selected]: { ...p[selected], questions: { ...p[selected].questions, [id]: { ...question, criteria: { ...question.criteria, [option]: value } } } } }
    })
  }
  async function saveSchema() {
    setSchemaError(''); setSchemaSaving(true)
    try {
      const parsed = JSON.parse(schemaDraft)
      const response = await fetch('/api/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, model, state: config.state || 'Schema validation', questions: parsed, images: [] }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error)
      invalidateQueue(selected); resetResult(); setSettings(p => ({ ...p, [selected]: { ...p[selected], questions: parsed } })); setDialog(undefined)
    } catch (e) { setSchemaError(e instanceof Error ? e.message : 'Invalid schema') }
    finally { setSchemaSaving(false) }
  }
  async function exportCard() {
    if (!result) return
    try { const winner = winning(Object.values(result.answers)[0]); await shareCard(experiment.name, winner.label, winner.probability, result.latency_ms, lastFrame.current, result.provider); setNotice('Result card saved.') }
    catch (e) { setError(e instanceof Error ? e.message : 'Export failed.') }
  }
  async function record() {
    if (recording) { recorder.current?.stop(); return }
    try {
      if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === 'undefined') throw new Error('Screen recording needs screen capture and MediaRecorder support. Use Chrome on your Mac.')
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false })
      recordingStream.current = stream
      const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type))
      if (!mimeType) { stream.getTracks().forEach(t => t.stop()); throw new Error('No supported recording format.') }
      const next = new MediaRecorder(stream, { mimeType }); const chunks: Blob[] = []
      next.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
      next.onstop = () => { stream.getTracks().forEach(t => t.stop()); recordingStream.current = undefined; recorder.current = undefined; setRecording(false); if (chunks.length) { download(new Blob(chunks, { type: mimeType }), `clef-session.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`); setNotice('Recording saved.') } }
      next.onerror = () => { setError('Recording failed.'); if (next.state !== 'inactive') next.stop() }
      stream.getVideoTracks()[0].addEventListener('ended', () => { if (next.state !== 'inactive') next.stop() })
      recorder.current = next; next.start(1000); setRecording(true)
    } catch (e) { setError(e instanceof Error ? e.message : 'Recording failed.') }
  }
  const primary = Object.entries(config.questions)[0]
  const feedback = runs.find(run => run.id === currentRun)?.feedback

  return <MotionConfig reducedMotion="user"><div className={`studio-shell ${focus ? 'focus-mode' : ''} ${portrait ? 'portrait-mode' : ''} ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
    <aside className="sidebar"><button className="brand" onClick={() => { setView('studio'); setFocus(false) }} aria-label="Clef studio home"><span className="brand-mark"><span /><span /><span /></span><span>clef<span className="brand-slash"> / </span><small>studio</small></span></button>
      <div className="sidebar-section"><span className="nav-label">WORKSPACE</span><button className={`nav-item ${view === 'studio' ? 'active' : ''}`} onClick={() => setView('studio')}><FlaskConical size={17} />Decision sandbox<ChevronRight size={13} /></button><button className={`nav-item ${view === 'history' ? 'active' : ''}`} onClick={() => { setFocus(false); setView('history'); setContinuous(false); setQueueRunning(false) }}><HistoryIcon size={17} />Run history<span className="nav-count">{runs.length.toString().padStart(2, '0')}</span></button></div>
      <div className="sidebar-section experiment-nav"><span className="nav-label">EXPERIMENTS <span>{experiments.length.toString().padStart(2, '0')}</span></span>{navExperiments.map(e => { const Icon = icons[e.id]; return <div key={e.id} className={e.id === 'custom' ? 'custom-entry' : ''}>{e.id === 'plant' && <span className="nav-label camera-label">CAMERA LAB</span>}{e.id === 'color' && <span className="nav-label camera-label">VALIDATION</span>}<button className={`experiment-item ${e.id === 'custom' ? 'custom-experiment' : ''} ${selected === e.id && view === 'studio' ? 'selected' : ''}`} onClick={() => choose(e.id)}><span className="experiment-icon" style={{ background: e.color }}><Icon size={15} strokeWidth={1.6} /></span><span>{e.short}</span><span className="experiment-number">{e.id === 'custom' ? '+' : e.number}</span></button></div> })}</div>
      <div className="custom-entry"><button className={`experiment-item custom-experiment ${selected === 'custom' && view === 'studio' ? 'selected' : ''}`} onClick={() => choose('custom')}><span className="experiment-icon"><Plus size={16} /></span><span>Build your own</span><span className="experiment-number">+</span></button></div>
      <div className="sidebar-bottom"><div className="local-machine"><span className="machine-icon"><Laptop size={19} /></span><div><strong>Local runtime</strong><span>Apple Silicon · Metal GPU</span></div><span className={`status-dot ${ready ? 'ready' : ''}`} /></div><button className="sidebar-link" onClick={() => { setView('studio'); setDialog('phone') }}><HelpCircle size={15} />Connect your phone<ArrowUpRight size={14} /></button></div>
    </aside>
    <main className="main-content"><header className="topbar"><Button className="sidebar-toggle" variant="ghost" size="icon-sm" aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setSidebarCollapsed(value => !value)}>{sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</Button><div className="breadcrumb">WORKSPACE <span>/</span><strong>{view === 'history' ? 'RUN HISTORY' : 'DECISION SANDBOX'}</strong></div><div className="topbar-actions"><button className="engine-pill" onClick={() => setDialog('settings')} aria-label="Engine settings"><span className={`status-dot ${ready ? 'ready' : ''}`} /><span>{provider === 'local' ? 'LOCAL' : 'CLOUDFLARE'}</span><span className="engine-pill-model">{model}</span><Settings2 size={12} /></button><Button variant="outline" size="sm" className={`record-button ${recording ? 'recording' : ''}`} onClick={() => void record()}>{recording ? <Square size={12} fill="currentColor" /> : <Video size={15} />}{recording ? 'Stop recording' : 'Record'}</Button></div></header>
      {view === 'history' ? <History runs={runs} onSelect={run => { setSettings(p => ({ ...p, [run.experiment]: { state: run.state, rules: run.rules, format: run.format, questions: run.questions } })); setSelected(run.experiment); setResult(run.result); setCurrentRun(run.id); lastFrame.current = undefined; setDialog('result') }} /> : <>
        <div className="workspace-heading"><div><span className="workspace-index">{experiment.number}</span><div><h2>{experiment.short}</h2><span>{experiment.id === 'match' ? 'Profile criteria and recommendation' : experiment.description}</span></div></div><div className="workspace-tools">{experiment.id === 'match' && <Button variant="outline" size="sm" disabled={busy || readingProfile} onClick={() => setDialog('android-profile')}><Camera size={14} />Capture profile</Button>}<Button variant="ghost" size="icon-sm" aria-label="Phone setup" onClick={() => setDialog('phone')}><HelpCircle size={17} /></Button><Button variant="outline" size="sm" onClick={() => setFocus(v => !v)}><Maximize2 size={14} />{focus ? 'Exit focus' : 'Focus view'}</Button>{focus && <Button variant="outline" size="sm" onClick={() => setPortrait(v => !v)}>{portrait ? 'Landscape' : 'Portrait 9:16'}</Button>}</div></div>
        <AnimatePresence>{error && <motion.div initial={{ opacity: 0, height: 0, marginBottom: 0 }} animate={{ opacity: 1, height: 'auto', marginBottom: 14 }} exit={{ opacity: 0, height: 0, marginBottom: 0 }} className="error-banner" role="alert"><strong>Something needs attention.</strong><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></motion.div>}</AnimatePresence>
        <motion.div key={selected} className={`experiment-workspace ${experiment.id === 'match' && androidSerial ? 'native-profile-workspace' : ''} ${primary?.[1].type === 'choice' && Object.keys(primary[1].criteria).length > 5 ? 'many-options-workspace' : ''}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}><MediaInput scanPhase={readingProfile ? 'collect' : 'score'} profileAside={experiment.id === 'match' || fullProfile} capturePreview={readingProfile ? profileCaptureFrame : undefined} profileControls={<>{fullProfile && queue && <ProfileScores items={queue.items.filter(item => profileSession!.ids.includes(item.id))} question={selected === 'match' ? 'photo_attraction' : 'attraction'} onSelect={id => chooseQueueImage(id)} selectedId={kind === 'queue' ? queue.selectedId : ''} running={queueRunning} ready={ready} busy={busy} onRun={() => setQueueRunning(true)} onPause={() => setQueueRunning(false)} />}{experiment.id === 'match' && <ProfileOCRPanel state={config.state} format={config.format} reading={readingProfile} canRead={!busy && !readingProfile && !addingImages && (Boolean(androidSerial) || (imageOCRSource && kind !== 'empty' && Boolean(status?.ocr?.available)))} canDecide={ready} onRead={() => void captureProfileText()} onDecide={() => { if (androidSerial) void captureProfileText(true); else void decide(true) }} onCollect={() => setDialog('android-profile')} onInspect={profileEvidence ? () => setDialog('profile-text') : undefined} native={!imageOCRSource} connected={Boolean(androidSerial)} mode={imageOCRSource ? 'immediate' : profileMode} onMode={mode => { setProfileMode(mode); resetResult(); if (mode === 'full' && !androidSerial) setDialog('android-profile') }} onSource={() => setDialog('android-profile')} progress={profileReadProgress} onStop={() => void stopAndroidCapture()} captured={capturedProfilePhotos} onReset={resetProfile} nextProfile={phoneProfile && capturedIdentity && (phoneProfile.name !== capturedIdentity.name || phoneProfile.age !== capturedIdentity.age) ? phoneProfile : undefined} />}</>} adding={addingImages} onImages={addImages} queuedImage={queuedItem} queueControls={!fullProfile && queue && <ImageQueue queue={queue} active={kind === 'queue'} running={queueRunning} busy={busy} ready={ready} adding={addingImages} onSelect={id => chooseQueueImage(id)} onRun={() => { setContinuous(false); setQueueRunning(true) }} onPause={() => setQueueRunning(false)} onAdd={() => media.current?.openUpload()} onClear={() => { clearQueue(selected); resetResult(); media.current?.clear(); setReference(undefined) }} />} reference={experiment.reference} camera={experiment.camera} busy={busy || readingProfile} ref={media} sample={experiment.sample} experiment={experiment.id} onResumePreview={source => { setKind(source); setQueueRunning(false); setContinuous(false); generation.current++; lastFrame.current = undefined }} onChange={inputChanged} onError={setError} onFrame={image => { lastFrame.current = image }} /><DecisionPanel  reference={reference} validationRuns={runs.filter(r => r.reference)} result={result} questions={config.questions} busy={busy} ready={ready} status={statusText} activeDecision={occupied ? activeDecision ?? undefined : undefined} onDecide={() => void decide()} onExport={() => void exportCard()} controls={<div className="stream-controls"><div><span className={`status-dot ${continuous ? 'ready' : ''}`} /><span>{continuous ? 'LIVE LOOP' : 'SINGLE FRAME'}</span><small>{['video', 'screen', 'camera'].includes(kind) ? 'Live input connected' : 'Upload or capture a feed to sample continuously'}</small></div><div><span className="interval-label">Every {intervalSeconds}s</span><Slider aria-label="Frame interval" className="interval-slider" min={2} max={30} step={1} value={[intervalSeconds]} onValueChange={v => setIntervalSeconds(v[0])} disabled={continuous} /><Button variant={continuous ? 'secondary' : 'outline'} size="sm" disabled={!ready || !['video', 'screen', 'camera'].includes(kind)} onClick={() => { setContinuous(v => !v); if (!continuous) void decide() }}>{continuous ? <Pause size={13} /> : <Play size={13} />}{continuous ? 'Pause' : 'Live loop'}</Button></div></div>} feedback={feedback} onFeedback={value => setRuns(p => p.map(r => r.id === currentRun ? { ...r, feedback: value } : r))} /></motion.div>

        <section className="configuration"><div className="context-editor"><div className="config-heading"><span><Database size={15} />STATE</span><div className="state-actions">{experiment.id === 'match' && <Button className="profile-ocr-button" variant="ghost" size="sm" disabled={busy || readingProfile || addingImages || (!androidSerial && (!imageOCRSource || kind === 'empty' || !status?.ocr?.available))} title={androidSerial ? 'Read the Android profile through accessibility' : status?.ocr?.available ? 'Capture visible profile text locally and prefill State' : 'Build the macOS OCR helper with npm run ocr:build'} onClick={() => void captureProfileText()}>{readingProfile ? <LoaderCircle className="ocr-spinner" size={13} /> : <ScanText size={13} />}{readingProfile ? 'Reading…' : 'Read profile text'}</Button>}<div className="format-toggle" role="group" aria-label="State format">{(['text', 'json'] as const).map(format => <button key={format} className={config.format === format ? 'active' : ''} onClick={() => { if (selected === 'match') setProfileOCR(false); invalidateQueue(selected); resetResult(); setSettings(p => ({ ...p, [selected]: { ...p[selected], format } })) }}>{format === 'text' ? 'Text' : 'JSON'}</button>)}</div></div></div><Textarea className={config.format === 'json' ? 'json-context' : ''} aria-label="Decision state" value={config.state} onChange={e => updateState(e.target.value)} placeholder={config.format === 'json' ? '{ "situation": "…", "requirements": [] }' : 'Add the text or data to evaluate. Optional with an image.'} spellCheck={config.format !== 'json'} /><div className="context-footer"><span>{experiment.id === 'match' && profileOCR ? <label className="profile-ocr-mode"><Switch size="sm" aria-label="Refresh profile text for each decision" checked={profileOCR} disabled={busy || readingProfile} onCheckedChange={value => { invalidateQueue(selected); resetResult(); setProfileOCR(value) }} />OCR · refresh each decision</label> : config.format === 'json' ? 'JSON is parsed and sent as structured state.' : 'The input being evaluated. Keep preferences in Decision rules.'}</span><span className="state-footer-actions">{experiment.id === 'match' && profileEvidence && <button onClick={() => setDialog('profile-text')} className="ocr-inspect">Inspect text</button>}{config.state.length.toLocaleString()} chars</span></div></div><div className="rules-editor"><div className="config-heading"><span><Scale size={15} />DECISION RULES</span><span className="field-note">Applied to every question</span></div><Textarea aria-label="Decision rules" value={config.rules} onChange={e => { invalidateQueue(selected); resetResult(); setSettings(p => ({ ...p, [selected]: { ...p[selected], rules: e.target.value } })) }} placeholder="Your preferences, constraints, or evaluation rubric." /><div className="context-footer"><span>How to judge the state. Held fixed between frames.</span><span>{config.rules.length.toLocaleString()} chars</span></div></div><div className="criteria-editor"><div className="config-heading"><span><Check size={15} />QUESTIONS / OPTIONS</span><Button variant="ghost" size="xs" onClick={() => { setSchemaDraft(JSON.stringify(config.questions, null, 2)); setSchemaError(''); setDialog('schema') }}><Code2 size={13} />Edit schema</Button></div>{primary?.[1].type === 'choice' ? Object.entries(primary[1].criteria).map(([option, description], i) => <label key={option} className="criterion"><span>0{i + 1}</span><div><strong>{option.replaceAll('_', ' ')}</strong><Input aria-label={`${option} criterion`} value={description} onChange={e => updateCriteria(primary[0], option, e.target.value)} /></div></label>) : <div className="schema-preview"><Code2 size={24} /><p>{Object.keys(config.questions).length} typed questions</p><span>Use the schema editor to edit every question.</span></div>}</div></section>

      </>}
    </main>
    <AnimatePresence>{notice && <motion.div initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} className="notice-toast" role="status"><Check size={16} />{notice}<button onClick={() => setNotice('')} aria-label="Dismiss notice"><X size={14} /></button></motion.div>}</AnimatePresence>
    <Dialog open={Boolean(dialog)} onOpenChange={open => { if (!open) setDialog(undefined) }}><DialogContent className={dialog === 'schema' ? 'schema-dialog' : dialog === 'android-profile' ? 'studio-dialog android-profile-dialog' : 'studio-dialog'}><DialogHeader><DialogTitle>{dialog === 'settings' ? 'Inference engine' : dialog === 'schema' ? 'Question schema' : dialog === 'result' ? 'Decision details' : dialog === 'profile-text' ? 'Profile text capture' : dialog === 'android-profile' ? 'Capture one profile' : 'Phone capture'}</DialogTitle><DialogDescription>{dialog === 'settings' ? 'Local runs on your Apple GPU. Cloudflare is an explicit optional mode.' : dialog === 'schema' ? 'Choice for actions, noul for yes/no probabilities, score for an ordered rubric.' : dialog === 'result' ? 'The original context, questions, and model response.' : dialog === 'android-profile' ? 'Collect the visible profile’s photos and written details from Android. Keep the phone on this profile during collection.' : dialog === 'profile-text' ? 'Written profile details from accessibility or image OCR. Expanded section headings keep attributes and prompt answers grouped in State.' : 'Mirror a phone into a Mac window, then share that window with the studio.'}</DialogDescription></DialogHeader>
      {dialog === 'settings' && <div className="settings-dialog-content"><div className="provider-options"><button className={provider === 'local' ? 'chosen' : ''} onClick={() => { invalidateQueue(selected); setContinuous(false); resetResult(); setProvider('local'); setModel('clef-flash') }}><Laptop size={22} /><strong>On my Mac</strong><span>Clef-flash · 9B · MPS</span>{provider === 'local' && <Check size={16} />}</button><button className={provider === 'cloudflare' ? 'chosen' : ''} onClick={() => { invalidateQueue(selected); setContinuous(false); resetResult(); setProvider('cloudflare') }}><Zap size={22} /><strong>Cloudflare</strong><span>Workers AI · requires keys</span>{provider === 'cloudflare' && <Check size={16} />}</button></div><div className="runtime-status"><span className={`status-dot ${ready ? 'ready' : ''}`} /><strong>{statusText}</strong></div>{provider === 'local' ? <><p className="dialog-copy">Start the runtime in another terminal. Weights load once and stay on the GPU.</p><code className="terminal-command">npm run model</code>{status?.local.status === 'error' && <p className="dialog-error">{status.local.error}</p>}<p className="dialog-copy">First time? Download the pinned Cloudflare weights:</p><code className="terminal-command">npm run model:download</code><p className="dialog-footnote">About 18 GB of weights. All inference stays on this Mac.</p></> : <><label className="model-toggle">Use the larger Clef model<Switch aria-label="Use larger Clef" checked={model === 'clef'} onCheckedChange={checked => { invalidateQueue(selected); resetResult(); setModel(checked ? 'clef' : 'clef-flash') }} /></label><p className="dialog-copy">Add your account ID and Workers AI token to <code>.env</code>, then restart <code>npm run dev</code>. Credentials stay on the API server.</p><code className="terminal-command">CLOUDFLARE_ACCOUNT_ID=…<br />CLOUDFLARE_AUTH_TOKEN=…</code><p className="dialog-footnote">This mode sends selected frames and context to Cloudflare.</p></>}<Button onClick={() => setDialog(undefined)}>Done<ArrowRight size={15} /></Button></div>}
      {dialog === 'schema' && <SchemaEditor value={schemaDraft} onChange={setSchemaDraft} onSave={() => void saveSchema()} saving={schemaSaving} serverError={schemaError} />}
      {dialog === 'android-profile' && <AndroidProfileCapture onUse={importProfileCollection} onImageSource={() => { setImageOCRSource(true); setAndroidSerial(''); setPhoneProfile(undefined); setProfileOCR(false); setDialog(undefined) }} onConnect={serial => { setImageOCRSource(false); setAndroidSerial(serial); setDialog(undefined); setNotice('Android accessibility connected · Read profile text collects the full profile.') }} />}
      {dialog === 'profile-text' && profileEvidence && <div className="run-detail ocr-evidence"><strong>{profileEvidence.engine || 'Captured profile text'}</strong><pre>{profileEvidence.profileText}</pre><strong>Excluded app controls</strong><pre>{profileEvidence.ignoredText || 'None'}</pre><p>Written distance is stored in distance_km; accessibility supplies photo_count. Tags, attributes and prompt answers retain their section labels. Missing fields stay null.</p></div>}
      {dialog === 'phone' && <PhoneCaptureGuide onShare={() => { setDialog(undefined); void media.current!.shareScreen() }} />}
      {dialog === 'result' && result && <><div className="run-detail"><strong>State</strong><p>{config.state || 'Visual input only'}</p><strong>Decision rules</strong><p>{config.rules}</p><strong>Questions</strong><pre>{JSON.stringify(config.questions, null, 2)}</pre><strong>Model response</strong><pre>{JSON.stringify(result, null, 2)}</pre></div><Button variant="outline" onClick={() => download(new Blob([JSON.stringify({ state: config.state, rules: config.rules, questions: config.questions, result }, null, 2)], { type: 'application/json' }), 'clef-decision.json')}><ArrowUpRight size={15} />Export JSON</Button></>}
    </DialogContent></Dialog>
  </div></MotionConfig>
}
