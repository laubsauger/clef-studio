import { spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import { resolve } from 'node:path'

let worker: ChildProcessWithoutNullStreams | undefined
let requestId = 0
let pending: { id: number; resolve: (value: { xml: string; capture_ms: number }) => void; reject: (error: Error) => void } | undefined
function stopBridge(message: string) {
  const child = worker
  worker = undefined
  pending?.reject(new Error(message)); pending = undefined
  child?.kill()
}
function startBridge() {
  const child = spawn(resolve('runtime/.venv/bin/python'), ['-u', resolve('runtime/android_bridge.py')], { stdio: 'pipe' })
  worker = child
  let stderr = ''
  child.stderr.on('data', bytes => { stderr = (stderr + bytes.toString()).slice(-1500) })
  child.stdin.on('error', error => { if (child === worker) stopBridge(`Android bridge input failed: ${error.message}`) })
  createInterface({ input: child.stdout }).on('line', line => {
    if (child !== worker || !pending) return
    try {
      const result = JSON.parse(line)
      if (result.id !== pending.id) throw new Error('Android bridge returned a mismatched request.')
      if (result.error) pending.reject(new Error(result.error))
      else if (typeof result.xml !== 'string') pending.reject(new Error('Android bridge returned no accessibility hierarchy.'))
      else pending.resolve({ xml: result.xml, capture_ms: result.capture_ms })
      pending = undefined
    } catch (error) { stopBridge(error instanceof Error ? error.message : 'Invalid Android bridge response.') }
  })
  child.on('error', error => { if (child === worker) stopBridge(`Android bridge could not start: ${error.message}. Install the runtime dependencies with npm run model:download.`) })
  child.on('exit', code => { if (child === worker) stopBridge(`Android bridge exited (${code}). ${stderr.trim()}`) })
  return child
}
process.once('exit', () => worker?.kill())

export async function androidHierarchy(serial: string, signal: AbortSignal) {
  signal.throwIfAborted()
  if (pending) throw new Error('An accessibility read is already running.')
  const child = worker ?? startBridge()
  const id = ++requestId
  const aborted = () => stopBridge('Android capture cancelled.')
  const timer = setTimeout(() => stopBridge('Android accessibility timed out. Reconnect and unlock the phone before trying again.'), 35000)
  signal.addEventListener('abort', aborted, { once: true })
  try {
    return await new Promise<{ xml: string; capture_ms: number }>((resolve, reject) => {
      pending = { id, resolve, reject }
      child.stdin.write(JSON.stringify({ id, serial }) + '\n')
    })
  } finally { clearTimeout(timer); signal.removeEventListener('abort', aborted) }
}
