import 'dotenv/config'
import express from 'express'
import { decisionSchema, validateResponse } from './schema.ts'
import { extractProfileText, profileImageSchema, profileOCRStatus } from './profile-ocr.ts'
import { androidDevices, androidRequestSchema, androidStep, cancelAndroidCapture, androidProfileIdentity } from './android.ts'

const app = express()
type Job = { id: string; experiment: string; provider: string; startedAt: string }
let activeDecision: Job | null = null
app.use(express.json({ limit: '13mb' }))
app.use((req, res, next) => {
  const origin = req.get('origin')
  if (origin && !['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:3001', 'http://localhost:3001'].includes(origin)) { res.status(403).json({ error: 'This sandbox accepts requests from localhost only.' }); return }
  next()
})
app.get('/api/status', async (_req, res) => {
  let local: { status: string; error?: string }
  try {
    const upstream = await fetch('http://127.0.0.1:8001/health', { signal: AbortSignal.timeout(2000) })
    if (!upstream.ok) throw new Error(`Runtime health returned ${upstream.status}`)
    local = await upstream.json()
  } catch (error) { local = { status: 'offline', error: error instanceof Error ? error.message : 'Runtime unreachable' } }
  res.json({ local, activeDecision, ocr: profileOCRStatus(), cloudflare: { configured: Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_AUTH_TOKEN) } })
})
app.post('/api/profile-text', async (req, res) => {
  const parsed = profileImageSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues.map(issue => issue.message).join('; ') }); return }
  if (!profileOCRStatus().available) { res.status(503).json({ error: 'Profile OCR requires macOS and the native helper. Run npm run ocr:build first.' }); return }
  try { res.json(await extractProfileText(parsed.data.image)) }
  catch (error) { res.status(422).json({ error: error instanceof Error ? error.message : 'Profile text recognition failed.' }) }
})
app.get('/api/android/devices', async (_req, res) => {
  try { res.json({ devices: await androidDevices() }) }
  catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : 'Could not query Android devices.' }) }
})
app.post('/api/android/cancel', async (req, res) => {
  const parsed = androidRequestSchema.safeParse({ serial: req.body.serial, action: 'capture' })
  if (!parsed.success) { res.status(400).json({ error: 'A valid Android device is required.' }); return }
  res.json(await cancelAndroidCapture(parsed.data.serial))
})
app.get('/api/android/profile-identity', async (req, res) => {
  const parsed = androidRequestSchema.safeParse({ serial: req.query.serial, action: 'capture' })
  if (!parsed.success) { res.status(400).json({ error: 'A valid Android device is required.' }); return }
  res.json(await androidProfileIdentity(parsed.data.serial))
})
app.post('/api/android/profile-step', async (req, res) => {
  const parsed = androidRequestSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues.map(issue => issue.message).join('; ') }); return }
  try { res.json(await androidStep(parsed.data)) }
  catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : 'Android profile capture failed.' }) }
})
app.post('/api/validate', (req, res) => {
  const result = decisionSchema.safeParse(req.body)
  if (!result.success) { res.status(400).json({ error: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') }); return }
  res.json({ valid: true })
})
app.post('/api/decide', async (req, res) => {
  const parsed = decisionSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') }); return }
  if (activeDecision) { res.status(429).json({ error: `${activeDecision.experiment} is already running on ${activeDecision.provider}. Wait for it to finish before starting another decision.`, activeDecision }); return }
  const { provider, experiment, ...body } = parsed.data
  const account = process.env.CLOUDFLARE_ACCOUNT_ID
  const token = process.env.CLOUDFLARE_AUTH_TOKEN
  if (provider === 'cloudflare' && (!account || !token)) { res.status(503).json({ error: 'Add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AUTH_TOKEN to .env, then restart the API.' }); return }
  activeDecision = { id: crypto.randomUUID(), experiment: experiment || 'A model check', provider, startedAt: new Date().toISOString() }
  const started = performance.now()
  try {
    const url = provider === 'local' ? 'http://127.0.0.1:8001/v1/systemone' : `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account!)}/ai/run/@cf/cloudflare/${body.model}`
    const upstream = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(provider === 'cloudflare' ? { Authorization: `Bearer ${token}` } : { 'X-Experiment': encodeURIComponent(activeDecision.experiment) }) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(180000),
    })
    const data = await upstream.json()
    if (upstream.status === 429) { res.status(429).json({ error: data.detail || 'The runtime is busy. Wait for the active decision to finish.', activeDecision: data.activeDecision }); return }
    if (!upstream.ok || (provider === 'cloudflare' && !data.success)) throw new Error(data.detail || data.errors?.map((e: { message: string }) => e.message).join('; ') || `Model endpoint returned HTTP ${upstream.status}`)
    const result = validateResponse(provider === 'cloudflare' ? data.result : data, body.questions)
    res.json({ ...result, provider, latency_ms: Math.round(performance.now() - started), timestamp: new Date().toISOString() })
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : 'Inference failed' })
  } finally { activeDecision = null }
})
app.use(express.static('dist'))
app.use((error: { status?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(error.status || 500).json({ error: error.message || 'Request failed' })
})
app.listen(3001, '127.0.0.1', () => console.log('Clef Studio API: http://127.0.0.1:3001'))
