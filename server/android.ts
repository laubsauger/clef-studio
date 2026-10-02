import { execFile } from 'node:child_process'
import { setTimeout } from 'node:timers/promises'
import { z } from 'zod'
import { nativeProfileFromUI, nativeProfileIdentity, NativeProfileUnavailable } from './android-ui.ts'
import { androidHierarchy } from './android-bridge.ts'

const serialSchema = z.string().regex(/^[a-zA-Z0-9_.:-]{1,128}$/)
export const androidRequestSchema = z.object({ serial: serialSchema, action: z.enum(['capture', 'open-bio', 'scroll-bio', 'close-bio', 'previous-photo', 'next-photo']), expected: z.object({ name: z.string().min(1), age: z.number().int().min(18).max(120) }).optional() }).superRefine((value, context) => { if (value.action !== 'capture' && !value.expected) context.addIssue({ code: 'custom', message: 'A verified profile is required before sending input.' }) })

function adb(args: string[], signal?: AbortSignal): Promise<Buffer> {
  return new Promise((resolve, reject) => execFile('adb', args, { encoding: 'buffer', signal, timeout: 12000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (signal?.aborted) { reject(new Error('Android capture cancelled.')); return }
    if (error) { reject(new Error(error.code === 'ENOENT' ? 'ADB is missing. Install android-platform-tools and restart the API.' : stderr.toString().trim() || error.message)); return }
    resolve(stdout)
  }))
}
export async function androidDevices(signal?: AbortSignal) {
  const text = (await adb(['devices', '-l'], signal)).toString()
  return text.split('\n').slice(1).filter(line => line.trim()).map(line => {
    const [serial, state, ...details] = line.trim().split(/\s+/)
    return { serial: serialSchema.parse(serial), state, model: details.find(detail => detail.startsWith('model:'))?.slice(6) ?? serial }
  })
}
async function screenshot(serial: string, signal: AbortSignal) {
  const bytes = await adb(['-s', serial, 'exec-out', 'screencap', '-p'], signal)
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('ADB did not return a PNG screenshot.')
  return { image: `data:image/png;base64,${bytes.toString('base64')}`, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}
let activeCapture: { serial: string; kind: 'identity' | 'capture'; controller: AbortController; done: Promise<void> } | undefined
export async function cancelAndroidCapture(serial: string) {
  const job = activeCapture
  if (!job || job.serial !== serial) return { cancelled: false }
  job.controller.abort()
  await job.done
  return { cancelled: true }
}
export async function androidProfileIdentity(serial: string) {
  if (activeCapture) return { available: false, busy: true }
  const controller = new AbortController()
  let finish!: () => void
  activeCapture = { serial, kind: 'identity', controller, done: new Promise<void>(resolve => { finish = resolve }) }
  try {
    const devices = await androidDevices(controller.signal)
    if (!devices.some(device => device.serial === serial && device.state === 'device')) return { available: false, error: 'Phone disconnected or unauthorized.' }
    const { xml } = await androidHierarchy(serial, controller.signal)
    return { available: true, profile: nativeProfileIdentity(xml) }
  } catch (error) { return { available: false, error: error instanceof Error ? error.message : 'Profile unavailable.' } }
  finally { activeCapture = undefined; finish() }
}
export async function androidStep(body: z.infer<typeof androidRequestSchema>) {
  if (activeCapture?.kind === 'identity') await activeCapture.done
  if (activeCapture) throw new Error('Android capture is already running. Use Cancel phone capture to stop it before starting another read.')
  const controller = new AbortController(), signal = controller.signal
  let finish!: () => void
  activeCapture = { serial: body.serial, kind: 'capture', controller, done: new Promise<void>(resolve => { finish = resolve }) }
  const request = (args: string[]) => adb(args, signal)
  try {
    const devices = await androidDevices(signal)
    if (!devices.some(device => device.serial === body.serial && device.state === 'device')) throw new Error('The selected phone is disconnected or unauthorized. Reconnect it and accept USB debugging.')
    async function readScreen(waitForTransition = false) {
      const started = performance.now()
      while (true) {
        signal.throwIfAborted()
        const screen = await screenshot(body.serial, signal)
        const { xml: output, capture_ms } = await androidHierarchy(body.serial, signal)
        try { return { ...screen, ...nativeProfileFromUI(output, screen.width, screen.height), capture_ms } }
        catch (error) {
          if (!waitForTransition || !(error instanceof NativeProfileUnavailable) || performance.now() - started > 8000) throw error
          await setTimeout(200, undefined, { signal })
        }
      }
    }
    let screen = await readScreen()
    if (body.expected && (screen.profile.name !== body.expected.name || screen.profile.age !== body.expected.age)) throw new Error('The profile changed. Collection stopped before sending input.')
    if (body.action !== 'capture') {
      const focus = (await request(['-s', body.serial, 'shell', 'dumpsys', 'window', 'displays'])).toString()
      if (!/mCurrentFocus=.*\bcom\.tinder\//.test(focus)) throw new Error('Tinder must be the foreground app before sending profile input.')
      if (['open-bio', 'previous-photo', 'next-photo'].includes(body.action) && screen.expanded) throw new Error('Close the expanded profile before navigating its photos.')
      if (['scroll-bio', 'close-bio'].includes(body.action) && !screen.expanded) throw new Error('The bio is no longer open. Collection stopped before sending input.')
      if (body.action === 'scroll-bio') {
        if (!screen.scroll) throw new Error('The profile scroll container is unavailable.')
        const box = screen.scroll
        const x = Math.round(box.x + box.width * 0.5)
        const from = Math.round(Math.min(box.y + box.height * 0.66, screen.height * 0.72))
        const to = Math.round(box.y + box.height * 0.22)
        await request(['-s', body.serial, 'shell', 'input', 'swipe', String(x), String(from), String(x), String(to), '450'])
      } else {
        const box = body.action === 'open-bio' ? screen.open : body.action === 'close-bio' ? screen.close : body.action === 'previous-photo' ? screen.previous : screen.next
        if (!box) throw new Error('Tinder did not expose the requested profile control.')
        const x = Math.round(box.x + box.width / 2)
        const y = Math.round(box.y + box.height / 2)
        if (y >= screen.height * 0.78) throw new Error('The detected control overlaps the matching action area. Capture stopped.')
        if (body.action === 'next-photo' && screen.pager?.index === screen.pager!.count - 1 || body.action === 'previous-photo' && screen.pager?.index === 0) throw new Error('Already at the first or last photo; collection stopped before tapping.')
        await request(['-s', body.serial, 'shell', 'input', 'tap', String(x), String(y)])
      }
      await setTimeout(250, undefined, { signal })
      const after = await readScreen(true)
      if (after.profile.name !== screen.profile.name || after.profile.age !== screen.profile.age) throw new Error('The profile changed after navigation. Collection stopped.')
      if (body.action === 'open-bio' && !after.expanded || body.action === 'close-bio' && after.expanded) throw new Error('The expected bio view did not open or close. Collection stopped.')
      screen = after
    }
    return { image: screen.image, width: screen.width, height: screen.height, text: screen.text, profile: screen.profile, expanded: screen.expanded, pager: screen.pager, capture_ms: screen.capture_ms }
  } finally { activeCapture = undefined; finish() }
}
