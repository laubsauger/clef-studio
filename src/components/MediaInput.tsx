import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Camera, FileText, ImagePlus, MonitorUp, Play, Snowflake, Upload, X, ScanLine, PanelLeftClose, PanelLeftOpen, Radio } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { imageData, loadImage } from '@/lib/media'
import { ScanOverlay } from '@/components/ScanOverlay'
import type { Reference } from '@/lib/experiments'

type CaptureOptions = { hold?: boolean; refresh?: boolean }
export type MediaHandle = { capture: (options?: CaptureOptions) => Promise<string | undefined>; openUpload: () => void; shareScreen: () => Promise<void>; returnToLive: () => boolean; clear: () => void }
type Props = { sample: string; experiment: string; busy: boolean; scanPhase: 'collect' | 'score'; camera?: boolean; reference?: Reference; queuedImage?: { id: string; image: string }; queueControls?: ReactNode; profileControls?: ReactNode; profileAside?: boolean; capturePreview?: string; adding: boolean; onImages: (files: File[]) => Promise<void>; onChange: (kind: string, reference?: Reference) => void; onResumePreview: (kind: string) => void; onError: (message: string) => void; onFrame: (image: string) => void }

export const MediaInput = forwardRef<MediaHandle, Props>(function MediaInput({ sample, experiment, busy, scanPhase, camera, reference, queuedImage, queueControls, profileControls, profileAside, capturePreview, adding, onImages, onChange, onResumePreview, onError, onFrame }, ref) {
  const [image, setImage] = useState(sample)
  const [kind, setKind] = useState(sample ? 'sample' : 'empty')
  const [videoUrl, setVideoUrl] = useState<string>()
  const [dragging, setDragging] = useState(false)
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [scanFrame, setScanFrame] = useState<string>()
  const [frozenFrame, setFrozenFrame] = useState<{ image: string; generation: number; resumePlayback: boolean; held: boolean }>()
  const [playback, setPlayback] = useState({ time: 0, duration: 0 })
  const video = useRef<HTMLVideoElement>(null)
  const profileCard = useRef<HTMLDivElement>(null)
  const stream = useRef<MediaStream | undefined>(undefined)
  const fileInput = useRef<HTMLInputElement>(null)
  const blobUrl = useRef<string | undefined>(undefined)
  const generation = useRef(0)
  const displayKind = queuedImage ? 'image' : kind
  const timeBased = ['screen', 'camera', 'video'].includes(displayKind)
  const frozen = timeBased && Boolean(frozenFrame)

  function cleanup() {
    generation.current++
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = undefined
    if (blobUrl.current) URL.revokeObjectURL(blobUrl.current)
    blobUrl.current = undefined
    setVideoUrl(undefined)
    setFrozenFrame(undefined)
  }
  useEffect(() => {
    cleanup(); setImage(sample); setKind(sample ? 'sample' : 'empty'); if (!queuedImage) onChange(sample ? 'sample' : 'empty', reference)
    // Release the latest active stream and object URL; these refs are resource holders, not DOM nodes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { generation.current++; stream.current?.getTracks().forEach(t => t.stop()); if (blobUrl.current) URL.revokeObjectURL(blobUrl.current) }
    // Input resets when switching experiments, not when parent callback identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sample, experiment])
  const queuedId = queuedImage?.id
  useEffect(() => { if (queuedId) setFrozenFrame(undefined) }, [queuedId])
  useEffect(() => {
    if (video.current && stream.current) { video.current.srcObject = stream.current; void video.current.play().catch(e => onError(String(e))) }
  }, [kind, onError, queuedId])
  useEffect(() => {
    if (busy || !frozenFrame || frozenFrame.held) return
    const timer = setTimeout(() => {
      if (generation.current !== frozenFrame.generation) return
      setFrozenFrame(undefined)
      if (frozenFrame.resumePlayback && video.current) void video.current.play().catch(error => onError(String(error)))
    }, 1000)
    return () => clearTimeout(timer)
  }, [busy, frozenFrame, onError])
  async function capture({ hold = false, refresh = false }: CaptureOptions = {}) {
    if (queuedImage) {
      const img = await loadImage(queuedImage.image)
      const frame = await imageData(img, img.width, img.height)
      setScanFrame(frame); onFrame(frame); return frame
    }
    if (kind === 'empty') return undefined
    if (kind === 'screen' || kind === 'camera' || kind === 'video') {
      if (frozenFrame?.held && !refresh) {
        if (!hold) setFrozenFrame({ ...frozenFrame, held: false })
        setScanFrame(frozenFrame.image); onFrame(frozenFrame.image); return frozenFrame.image
      }
      if (!video.current) throw new Error('The video input is unavailable.')
      const ticket = generation.current
      const resumePlayback = kind === 'video' && (!video.current.paused || Boolean(frozenFrame?.resumePlayback))
      const frame = await imageData(video.current, video.current.videoWidth, video.current.videoHeight)
      if (ticket !== generation.current) throw new Error('The input changed while capturing. Run the decision again on the new input.')
      if (kind === 'video') video.current.pause()
      setFrozenFrame({ image: frame, generation: ticket, resumePlayback, held: hold })
      setScanFrame(frame); onFrame(frame); return frame
    }
    const img = await loadImage(image)
    const frame = await imageData(img, img.width, img.height)
    setScanFrame(frame); onFrame(frame); return frame
  }
  function returnToLive() {
    if (!stream.current) return false
    setFrozenFrame(undefined); onResumePreview(kind); return true
  }
  useImperativeHandle(ref, () => ({ capture, openUpload: () => fileInput.current?.click(), shareScreen: () => startCapture('screen'), returnToLive, clear: () => { cleanup(); setImage(''); setKind('empty'); onChange('empty') } }))

  async function upload(files: File[]) {
    try {
      if (!files.length) return
      const file = files[0]
      if (file.type.startsWith('video/')) {
        if (files.length !== 1) throw new Error('Choose one video, or multiple JPEG, PNG, or WebP images for the queue.')
        cleanup(); const url = URL.createObjectURL(file); blobUrl.current = url
        setVideoUrl(url); setImage(''); setKind('video'); onChange('video')
      } else {
        if (files.some(item => !['image/jpeg', 'image/png', 'image/webp'].includes(item.type))) throw new Error('Image queues accept JPEG, PNG, and WebP files. Upload a video on its own.')
        await onImages(files)
      }
    } catch (e) { onError(e instanceof Error ? e.message : 'Could not load file.') }
  }
  async function startCapture(mode: 'screen' | 'camera') {
    try {
      const ticket = generation.current
      if (!navigator.mediaDevices) throw new Error('Capture requires a browser on localhost or HTTPS.')
      if (mode === 'screen' && !navigator.mediaDevices.getDisplayMedia) throw new Error('Screen capture is unavailable in this browser. Use Chrome on your Mac.')
      const nextStream = mode === 'screen' ? await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false }) : await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false })
      if (ticket !== generation.current) { nextStream.getTracks().forEach(t => t.stop()); return }
      cleanup(); stream.current = nextStream; setImage(''); setKind(mode); onChange(mode)
      nextStream.getVideoTracks()[0].addEventListener('ended', () => {
        if (stream.current !== nextStream) return
        cleanup(); setKind('empty'); onChange('empty')
      })
    } catch (e) { onError(e instanceof Error ? e.message : 'Capture failed.') }
  }

  return <section className={`input-panel ${profileAside ? 'with-profile-rail' : ''} ${railCollapsed ? 'profile-rail-collapsed' : ''}`} aria-label="Visual input">
    <div className="panel-heading"><span>{profileAside && <Button variant="ghost" size="icon-xs" aria-label={railCollapsed ? 'Expand profile panel' : 'Collapse profile panel'} onClick={() => setRailCollapsed(value => !value)}>{railCollapsed ? <PanelLeftOpen size={13} /> : <PanelLeftClose size={13} />}</Button>}<ScanLine size={16} /> INPUT</span><span className="input-type">{queuedImage && stream.current && <Button variant="secondary" size="xs" className="return-live-preview" onClick={() => { setFrozenFrame(undefined); onResumePreview(kind) }}><Radio size={12} />Return to live preview</Button>}{adding ? 'ADDING IMAGES…' : frozen ? `CAPTURED · ${kind.toUpperCase()}` : queuedImage ? 'QUEUED IMAGE' : kind === 'sample' ? 'SAMPLE IMAGE' : kind === 'empty' ? 'TEXT / JSON' : kind.toUpperCase()}{frozen ? <Snowflake size={11} /> : ['screen', 'camera'].includes(displayKind) && <i className="live-dot" />}</span></div>
    <div className={`media-stage ${dragging ? 'dragging' : ''} ${experiment === 'match' && displayKind === 'sample' ? 'profile-stage' : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); if (!adding) void upload(Array.from(e.dataTransfer.files)) }}>
      {displayKind !== 'empty' && <Button className="clear-input" variant="secondary" size="icon-sm" aria-label="Clear input" onClick={() => { cleanup(); setImage(''); setKind('empty'); onChange('empty') }}><X size={14} /></Button>}
      {experiment === 'match' && displayKind === 'sample' ? <>
        <div className="stage-ring ring-one" /><div className="stage-ring ring-two" />
        <div className="profile-card" ref={profileCard}><img src={image} alt="Sample portrait for a fictional dating profile" /><div className="profile-gradient" /><div className="profile-details"><span className="profile-location">LISBON · 3 KM AWAY</span><h3>Sofia <span>29</span></h3><p>Weekend hikes. Dinner with friends.<br />Probably making a terrible pun.</p><div className="profile-tags"><span>Outdoors</span><span>Long term</span></div></div><div className="profile-counter">01 / 01</div></div>
        <div className="sample-stamp">SAMPLE INPUT<span>NOT A LIVE FEED</span></div>
      </> : queuedImage || kind === 'sample' || kind === 'image' ? <img className="uploaded-image" src={queuedImage?.image ?? image} alt="Image submitted for this experiment" /> : ['video', 'screen', 'camera'].includes(kind) ? <video className={frozen ? 'preview-frozen' : ''} aria-hidden={frozen || undefined} ref={video} src={videoUrl} muted playsInline autoPlay={kind !== 'video'} controls={kind === 'video'} onLoadedMetadata={() => { if (video.current) setPlayback({ time: 0, duration: video.current.duration }) }} onTimeUpdate={() => { if (video.current) setPlayback(p => ({ ...p, time: video.current!.currentTime })) }} /> : <div className="empty-input"><div className="empty-icon">{camera ? <Camera size={30} strokeWidth={1.4} /> : <ImagePlus size={30} strokeWidth={1.4} />}</div><h3>{camera ? 'Camera experiment' : 'No visual input'}</h3><p>{camera ? 'Show the subject to your webcam, then run a decision.' : 'Drop an image or video, or use text / JSON below.'}</p><Button variant="outline" onClick={() => camera ? void startCapture('camera') : fileInput.current?.click()}>{camera ? <Camera size={15} /> : <Upload size={15} />}{camera ? 'Start camera' : 'Choose a file'}</Button><small>JPEG, PNG, WebP, or a browser-playable video</small></div>}
      <AnimatePresence>{capturePreview && <div className="captured-frame"><img src={capturePreview} alt="Android capture in progress" /></div>}{frozen && frozenFrame && <motion.div className="captured-frame" initial={false} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}><img src={frozenFrame.image} alt="Captured frame being evaluated" /></motion.div>}</AnimatePresence>
      {frozenFrame?.held && !busy && <Button className="resume-preview" variant="secondary" size="sm" onClick={() => { setFrozenFrame(undefined); if (frozenFrame.resumePlayback && video.current) void video.current.play().catch(error => onError(String(error))) }}><Play size={13} />Resume preview</Button>}
      {dragging && <div className="drop-overlay">Drop to add your input</div>}
      <ScanOverlay key={scanPhase} phase={scanPhase} frame={capturePreview ?? scanFrame} cover={!capturePreview && experiment === 'match' && displayKind === 'sample'} target={!capturePreview && experiment === 'match' && displayKind === 'sample' ? profileCard.current : undefined} busy={busy && (Boolean(capturePreview) || !timeBased || frozen)} onError={onError} />
    </div>
    {experiment === 'color' && <div className="fixture-toolbar"><span>SWATCHES</span>{Object.entries({ red: '#e53935', orange: '#f97316', yellow: '#f4d400', green: '#12a858', blue: '#2563eb', purple: '#9c36e8', black: '#080808', white: '#f6f6f6' }).map(([label, color]) => <button aria-label={`${label} swatch`} title={label} key={label} style={{ background: color }} onClick={() => { cleanup(); const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 600; const ctx = canvas.getContext('2d')!; ctx.fillStyle = color; ctx.fillRect(0, 0, 800, 600); setImage(canvas.toDataURL('image/jpeg', 0.95)); setKind('image'); onChange('image', { question: 'color', label }) }} />)}</div>}
    {profileAside ? <aside className="profile-rail" aria-label="Profile capture and photo results">{profileControls}{queueControls}</aside> : <>{queueControls}{profileControls}</>}
    {displayKind === 'video' && <div className="video-timeline"><Play size={13} /><input aria-label="Video position" type="range" disabled={frozen} min="0" max={Number.isFinite(playback.duration) ? playback.duration : 0} step="0.1" value={playback.time} onChange={e => { if (video.current) video.current.currentTime = Number(e.target.value) }} /><span>{playback.time.toFixed(1)}s</span></div>}
    <div className="source-toolbar"><Button variant="ghost" size="sm" disabled={adding} onClick={() => fileInput.current?.click()}><Upload />{queueControls ? 'Add files' : 'Upload'}</Button><Button variant="ghost" size="sm" onClick={() => void startCapture('screen')}><MonitorUp />Screen / phone</Button><Button variant="ghost" size="sm" onClick={() => void startCapture('camera')}><Camera />Camera</Button><Button variant="ghost" size="sm" onClick={() => { cleanup(); setImage(''); setKind('empty'); onChange('empty') }}><FileText />Text / JSON</Button></div>
    <input ref={fileInput} hidden multiple type="file" accept="image/jpeg,image/png,image/webp,video/*" aria-label="Upload input" onChange={e => { const files = Array.from(e.target.files ?? []); if (!adding) void upload(files); e.target.value = '' }} />
  </section>
})
