import { useEffect, useRef, useState } from 'react'
import { Check, LoaderCircle, RefreshCw, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { androidStep, cancelAndroid, collectAndroidProfile } from '@/lib/android-profile'
import type { AndroidScreen, ProfileCollection } from '@/lib/android-profile'
import './AndroidProfileCapture.css'

export function AndroidProfileCapture({ onUse, onConnect, onImageSource }: { onUse: (collection: ProfileCollection, experiment: 'match' | 'fit') => Promise<void>; onConnect: (serial: string) => void; onImageSource: () => void }) {
  const [devices, setDevices] = useState<{ serial: string; model: string; state: string }[]>([])
  const [serial, setSerial] = useState('')
  const [screen, setScreen] = useState<AndroidScreen>()
  const [count, setCount] = useState<number>()
  const [collection, setCollection] = useState<ProfileCollection>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Connect an authorized Android phone and show one profile.')
  const [error, setError] = useState('')
  const stopped = useRef(false)
  useEffect(() => {
    let alive = true, pending = false
    async function discover() {
      if (pending) return
      pending = true
      try { await fetch('/api/android/devices').then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error); if (alive) { setDevices(body.devices); setError('') } }).catch(error => { if (alive) setError(String(error.message)) }) }
      finally { pending = false }
    }
    void discover(); const timer = setInterval(() => void discover(), 3000)
    return () => { alive = false; clearInterval(timer); stopped.current = true }
  }, [])
  async function refresh(device = serial) {
    setBusy(true); setError(''); setCollection(undefined); setScreen(undefined); setCount(undefined)
    try {
      const next = await androidStep(device, 'capture')
      setScreen(next)
      const pager = next.pager
      if (!pager && !next.expanded) throw new Error('The profile photo index is unavailable.')
      setCount(pager?.count)
      setMessage(`${next.profile.name}, ${next.profile.age} · ${pager ? `${pager.count} photos · current photo ${pager.index + 1}` : 'Expanded details; collection returns to the photo gallery.'}`)
    } catch (error) { setError(error instanceof Error ? error.message : 'Phone capture failed.') }
    finally { setBusy(false) }
  }
  async function collect() {
    if (!screen) return
    stopped.current = false; setBusy(true); setError(''); setCollection(undefined)
    try {
      const result = await collectAndroidProfile(screen, serial, (message, frame) => { setMessage(message); setScreen(frame) }, () => stopped.current)
      setCollection(result)
    } catch (error) { setError(error instanceof Error ? error.message : 'Profile collection failed.') }
    finally { setBusy(false) }
  }
  async function use(experiment: 'match' | 'fit') {
    if (!collection) return
    setBusy(true); setError('')
    try { await onUse(collection, experiment) }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not import the captured profile.') }
    finally { setBusy(false) }
  }
  return <div className="android-profile-capture">
    <div className="android-device-list">{devices.map(device => <Button key={device.serial} variant={serial === device.serial ? 'secondary' : 'outline'} size="sm" disabled={busy || device.state !== 'device'} onClick={() => { setSerial(device.serial); void refresh(device.serial) }}><Smartphone size={14} />{device.model.replaceAll('_', ' ')}{device.state !== 'device' && ` · ${device.state}`}</Button>)}{!devices.length && <p>No Android device detected. Reconnect USB and accept the debugging prompt.</p>}</div>
    <div className="android-capture-workspace"><div className="android-capture-preview">{screen ? <img src={screen.image} alt="Current Android profile capture" /> : <Smartphone size={42} />}{busy && <span className="android-capture-loading"><LoaderCircle className="ocr-spinner" size={15} />{message}</span>}</div><div className="android-capture-details"><p className="android-capture-status" aria-live="polite">{message}</p><ol><li>Open the expanded profile and read its photo count.</li><li>Capture each photo alongside the name, age and visible bio.</li><li>Read all expanded sections, tags and prompt answers until the end.</li><li>Merge written details; review before evaluating.</li></ol>{collection && <><div className="android-captured-summary"><Check size={15} />{collection.photos.length} photos · {collection.bioScreens} detail screens</div><pre>{JSON.stringify(collection.text.profile, null, 2)}</pre><div className="android-use-actions"><Button onClick={() => void use('match')} disabled={busy}>Use for Match / pass</Button><Button variant="secondary" onClick={() => void use('fit')} disabled={busy}>Score photos</Button></div></>}{error && <p role="alert" className="dialog-error">{error}</p>}<div className="android-capture-actions"><Button variant="ghost" size="sm" disabled={busy} onClick={onImageSource}>Use image OCR</Button><Button variant="secondary" size="sm" disabled={!serial || busy} onClick={() => onConnect(serial)}>Use Android accessibility</Button><Button variant="outline" size="sm" disabled={!serial || busy} onClick={() => void refresh()}><RefreshCw size={13} />Refresh phone</Button>{busy ? <Button variant="secondary" size="sm" onClick={() => { stopped.current = true; setMessage('Cancelling…'); void cancelAndroid(serial).catch(error => setError(error.message)) }}>Cancel capture</Button> : <Button disabled={!screen || (!count && !screen.expanded)} onClick={() => void collect()}>Capture bio + photos</Button>}</div></div></div>
  </div>
}
