import { useEffect, useState } from 'react'
import { ArrowRight, Check, Copy, MonitorUp, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import './PhoneCaptureGuide.css'

const androidCommand = 'scrcpy --select-usb --no-audio --max-size=1280 --window-title="Android phone"'

export function PhoneCaptureGuide({ onShare }: { onShare: () => void }) {
  const [platform, setPlatform] = useState<'android' | 'iphone'>('android')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])
  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(androidCommand)
      setError(''); setCopied(true)
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not copy the command.') }
  }
  return <div className="phone-instructions">
    <div className="phone-platforms" role="group" aria-label="Phone platform">
      <Button variant="ghost" aria-pressed={platform === 'android'} onClick={() => { setPlatform('android'); setError('') }}><Smartphone size={15} />Android</Button>
      <Button variant="ghost" aria-pressed={platform === 'iphone'} onClick={() => { setPlatform('iphone'); setError('') }}><Smartphone size={15} />iPhone</Button>
    </div>
    {platform === 'android' ? <>
      <div className="phone-step"><span>01</span><div><h4>Connect Android by USB</h4><p>In Settings → About phone, tap Build number seven times. Enable USB debugging in Developer options, connect a data-capable USB cable, then accept the debugging prompt on your phone.</p><details className="phone-install"><summary>Samsung says “blocked by Auto Blocker”?</summary><p>Open Settings → Security and privacy → Auto Blocker and turn it off for this session. Then enable USB debugging and reconnect. You can turn Auto Blocker back on when finished.</p></details></div></div>
      <div className="phone-step"><span>02</span><div><h4>Open the phone mirror</h4><p>Run this in a Mac terminal. Keep the “Android phone” window open.</p><div className="phone-command"><code>{androidCommand}</code><Button variant="ghost" size="icon-sm" aria-label="Copy Android mirror command" onClick={() => void copyCommand()}>{copied ? <Check size={15} /> : <Copy size={15} />}</Button></div><span className="phone-copy-status" aria-live="polite">{copied ? 'Copied to clipboard' : ''}</span><details className="phone-install"><summary>First time? Install scrcpy and adb</summary><code className="terminal-command">brew install scrcpy<br />brew install --cask android-platform-tools</code></details></div></div>
    </> : <>
      <div className="phone-step"><span>01</span><div><h4>Connect iPhone by USB</h4><p>Unlock your iPhone, connect it to the Mac and accept the Trust This Computer prompt.</p></div></div>
      <div className="phone-step"><span>02</span><div><h4>Open the phone mirror</h4><p>In QuickTime Player, choose File → New Movie Recording. Open the camera menu next to Record and select your iPhone. Leave that preview window open; you do not need to record.</p></div></div>
    </>}
    <div className="phone-step"><span>03</span><div><h4>Share the phone window</h4><p>Use the button below, then choose {platform === 'android' ? '“Android phone”' : 'the QuickTime preview'} in Chrome’s window picker. Run one decision or start the live loop. You can also use Screen / phone in the input panel.</p></div></div>
    <div className="phone-callout"><MonitorUp size={18} /><p>The studio evaluates captured frames. You keep control of the phone; the preview freezes on the submitted frame during each decision.</p></div>
    {error && <p className="dialog-error" role="alert">{error}</p>}
    <Button onClick={onShare}><MonitorUp size={15} />Share phone window<ArrowRight size={15} /></Button>
  </div>
}
