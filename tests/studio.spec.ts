import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/android/devices', route => route.fulfill({ json: { devices: [] } }))
  await page.route('**/api/android/profile-identity*', route => route.fulfill({ json: { available: false } }))
  await page.route('**/api/status', route => route.fulfill({ json: { local: { status: 'ready', device: 'mps' }, cloudflare: { configured: false } } }))
})
function result(questions: Record<string, { type: string; criteria?: Record<string, string> | string[] }>) {
  return { model: 'clef-flash', provider: 'local', answers: Object.fromEntries(Object.entries(questions).map(([id, q]) => {
    if (q.type === 'noul') return [id, { type: 'noul', noul: 0.9 }]
    if (q.type === 'score') return [id, { type: 'score', score: 2.6, confidence: 0.8, legend: Object.fromEntries((q.criteria as string[]).map((s, i) => [i, s])), probabilities: { '0': 0.05, '1': 0.05, '2': 0.1, '3': 0.8 } }]
    const keys = Object.keys(q.criteria!); return [id, { type: 'choice', choice: keys[0], confidence: 0.9, probabilities: Object.fromEntries(keys.map((key, i) => [key, i === 0 ? 0.9 : 0.1 / (keys.length - 1)])) }]
  })), usage: { input_tokens: 123, output_tokens: 0 }, latency_ms: 420, timestamp: new Date().toISOString() }
}
test('dark compact tool, independent state/rules, custom entry last', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Dating profiles', exact: true })).toBeVisible()
  expect(await page.locator('html').evaluate(el => getComputedStyle(el).colorScheme)).toBe('dark')
  await expect(page.getByRole('textbox', { name: 'Decision state', exact: true })).toHaveValue(/Fictional sample profile/)
  await expect(page.getByRole('textbox', { name: 'Decision rules', exact: true })).toHaveValue(/My preferences/)
  await expect(page.locator('.experiment-item').last()).toContainText('Build your own')
  await expect(page.locator('.custom-entry')).toBeVisible()
  expect(errors).toEqual([])
  await page.screenshot({ path: test.info().outputPath('clef-verified-desktop.png'), fullPage: true })
})
test('phone guide supports both platforms and shares an Android window from history', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.addInitScript(() => {
    const state = window as Window & { phoneCaptureCalls: number }; state.phoneCaptureCalls = 0
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { value: async () => {
      state.phoneCaptureCalls++
      const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 800
      const drawing = canvas.getContext('2d')!; drawing.fillStyle = '#325742'; drawing.fillRect(0, 0, 480, 800)
      return canvas.captureStream(5)
    } })
  })
  await page.goto('/'); await page.getByRole('button', { name: /Run history/ }).click()
  await page.getByRole('button', { name: 'Connect your phone' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: 'Android', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog).toContainText('USB debugging')
  await dialog.getByRole('button', { name: 'Copy Android mirror command' }).click()
  await expect(dialog).toContainText('Copied to clipboard')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('scrcpy --select-usb --no-audio --max-size=1280 --window-title="Android phone"')
  await dialog.getByText('First time? Install scrcpy and adb').click()
  await expect(dialog).toContainText('brew install --cask android-platform-tools')
  await dialog.getByRole('button', { name: 'iPhone', exact: true }).click()
  await expect(dialog).toContainText('QuickTime Player')
  await expect(dialog.getByRole('button', { name: 'Copy Android mirror command' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Android', exact: true }).click()
  await dialog.getByRole('button', { name: 'Share phone window' }).click()
  await expect(dialog).toHaveCount(0)
  await expect.poll(() => page.locator('.media-stage>video').evaluate(el => (el as HTMLVideoElement).videoHeight)).toBe(800)
  expect(await page.evaluate(() => (window as Window & { phoneCaptureCalls: number }).phoneCaptureCalls)).toBe(1)
  await expect(page.getByRole('heading', { name: 'Dating profiles', exact: true })).toBeVisible()
})

test('profile OCR resumes preview automatically and refreshes matching text for decisions', async ({ page }) => {
  await page.route('**/api/status', route => route.fulfill({ json: { local: { status: 'ready' }, ocr: { available: true, engine: 'Apple Vision' }, cloudflare: { configured: false } } }))
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { value: async () => {
      const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 800
      const drawing = canvas.getContext('2d')!; let index = 0
      const paint = () => { drawing.fillStyle = `hsl(${index++ % 360}, 70%, 45%)`; drawing.fillRect(0, 0, 480, 800) }
      paint(); setInterval(paint, 40); return canvas.captureStream(5)
    } })
  })
  const ocrFrames: string[] = []; const requests: { state: { name: string; age: number } | string; images: string[] }[] = []
  await page.route('**/api/profile-text', route => {
    const image = route.request().postDataJSON().image; ocrFrames.push(image)
    const text = image === ocrFrames[0] ? 'Sofia, 29\nLisbon\nWeekend hikes' : 'Maya, 31\nBerlin\nCycling'
    return route.fulfill({ json: { engine: 'Apple Vision', text, lines: text.split('\n').map((line, index) => ({ text: line, confidence: 0.98, bounds: { x: 0.1, y: 0.2 + index * 0.1, width: 0.6, height: 0.04 } })), recognition_ms: 120, width: 480, height: 800 } })
  })
  await page.route('**/api/decide', route => { const body = route.request().postDataJSON(); requests.push(body); return route.fulfill({ json: result(body.questions) }) })
  await page.goto('/'); await page.getByRole('button', { name: 'Android accessibility', exact: true }).click(); await page.getByRole('button', { name: 'Use image OCR', exact: true }).click(); await page.getByRole('button', { name: 'Screen / phone', exact: true }).click()
  await expect.poll(() => page.locator('.media-stage>video').evaluate(el => (el as HTMLVideoElement).videoHeight)).toBe(800)
  await page.getByRole('button', { name: 'Read profile text', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Decision state', exact: true })).toHaveValue(/"name": "Sofia"/)
  await expect(page.getByRole('switch', { name: 'Refresh profile text for each decision' })).toBeChecked()
  await expect(page.locator('.captured-frame')).toHaveCount(0)
  await page.getByRole('button', { name: 'Make a decision' }).click()
  await expect.poll(() => requests.length).toBe(1)
  expect(requests[0].images[0]).toBe(ocrFrames[1]); expect(requests[0].state).toMatchObject({ name: 'Maya', age: 31, location: null, other_visible_text: ['Berlin', 'Cycling'] })
  await expect(page.locator('.captured-frame')).toHaveCount(0)
  await page.getByRole('button', { name: 'Run again' }).click()
  await expect.poll(() => requests.length).toBe(2)
  expect(requests[1].images[0]).not.toBe(ocrFrames[0]); expect(requests[1].state).toMatchObject({ name: 'Maya', age: 31, location: null, other_visible_text: ['Berlin', 'Cycling'] })
  await expect(page.getByRole('button', { name: 'Run again' })).toBeEnabled()
  await page.getByRole('group', { name: 'State format' }).getByRole('button', { name: 'Text', exact: true }).click()
  await page.getByRole('textbox', { name: 'Decision state', exact: true }).fill('Manually corrected profile details')
  await expect(page.getByRole('switch', { name: 'Refresh profile text for each decision' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Make a decision' }).click()
  await expect.poll(() => requests.length).toBe(3)
  expect(ocrFrames.length).toBe(3); expect(requests[2].state).toBe('Manually corrected profile details')
})

test('empty or stale OCR never overwrites state or sends a decision', async ({ page }) => {
  await page.route('**/api/status', route => route.fulfill({ json: { local: { status: 'ready' }, ocr: { available: true, engine: 'Apple Vision' }, cloudflare: { configured: false } } }))
  let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve }); let started = false; let empty = false; let decisions = 0
  await page.route('**/api/profile-text', async route => {
    started = true
    if (!empty) await pending
    const text = empty ? '' : 'Sofia, 29'
    await route.fulfill({ json: { engine: 'Apple Vision', text, lines: text ? [{ text, confidence: 0.9, bounds: { x: 0.1, y: 0.2, width: 0.6, height: 0.04 } }] : [], recognition_ms: 90, width: 480, height: 800 } })
  })
  await page.route('**/api/decide', route => { decisions++; return route.fulfill({ json: {} }) })
  await page.goto('/'); await page.getByRole('button', { name: 'Android accessibility', exact: true }).click(); await page.getByRole('button', { name: 'Use image OCR', exact: true }).click(); await page.getByRole('button', { name: 'Read profile text', exact: true }).click()
  await expect.poll(() => started).toBe(true)
  const state = page.getByRole('textbox', { name: 'Decision state', exact: true })
  await state.fill('My manual correction'); release()
  await expect(page.getByRole('button', { name: 'Read profile text', exact: true })).toBeEnabled()
  await expect(state).toHaveValue('My manual correction')
  await expect(page.getByRole('switch', { name: 'Refresh profile text for each decision' })).toHaveCount(0)
  empty = true; await page.getByRole('button', { name: 'Read profile text', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('No readable profile text found')
  await expect(state).toHaveValue('My manual correction'); expect(decisions).toBe(0)
})

test('JSON is structured, rules are applied, feedback/history/export work', async ({ page }) => {
  let sent: { state: unknown; questions: Record<string, { type: string; instructions: string; criteria: Record<string, string> }> } | undefined
  await page.route('**/api/decide', async route => { sent = route.request().postDataJSON(); await route.fulfill({ json: result(sent!.questions) }) })
  await page.goto('/'); await page.getByRole('button', { name: /Build your own/ }).click()
  await page.getByRole('group', { name: 'State format' }).getByRole('button', { name: 'JSON', exact: true }).click()
  await page.getByRole('textbox', { name: 'Decision state', exact: true }).fill('{"number":42}')
  await page.getByRole('textbox', { name: 'Decision rules', exact: true }).fill('Proceed only for numbers above 10.')
  await page.getByRole('button', { name: 'Make a decision' }).click()
  await expect(page.getByRole('heading', { name: 'yes', exact: true })).toBeVisible()
  expect(sent!.state).toEqual({ number: 42 }); expect(sent!.questions.action.instructions).toContain('Proceed only for numbers above 10.')
  await page.getByRole('button', { name: 'Agree with decision', exact: true }).click()
  const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export result card' }).click(); expect((await downloadEvent).suggestedFilename()).toBe('clef-decision.png')
  await page.getByRole('button', { name: /Run history/ }).click(); await expect(page.locator('.history-row')).toHaveCount(1)
  const sessionExport = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export session' }).click(); expect((await sessionExport).suggestedFilename()).toBe('clef-session.json')
  await page.locator('.history-row').click(); await expect(page.getByRole('dialog')).toContainText('Proceed only for numbers above 10.')
})
test('bad JSON and a bad schema show errors without issuing inference', async ({ page }) => {
  let requests = 0; await page.route('**/api/decide', route => { requests++; return route.fulfill({ json: {} }) })
  await page.goto('/'); await page.getByRole('button', { name: /Build your own/ }).click()
  await page.getByRole('group', { name: 'State format' }).getByRole('button', { name: 'JSON', exact: true }).click()
  await page.getByRole('textbox', { name: 'Decision state', exact: true }).fill('{broken')
  await page.getByRole('button', { name: 'Make a decision' }).click(); await expect(page.getByRole('alert')).toBeVisible(); expect(requests).toBe(0)
  await page.getByRole('button', { name: 'Edit schema' }).click(); await page.getByRole('textbox', { name: 'Question schema JSON' }).fill('{}'); await expect(page.getByRole('button', { name: 'Apply schema' })).toBeDisabled(); await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible()
})
test('input uploads, edits, and experiment switches invalidate results', async ({ page }) => {
  await page.route('**/api/decide', route => route.fulfill({ json: result(route.request().postDataJSON().questions) }))
  await page.goto('/'); await page.locator('input[type=file]').setInputFiles('public/samples/market.jpg')
  await expect(page.locator('.uploaded-image')).toBeVisible(); await page.getByRole('button', { name: 'Make a decision' }).click(); await expect(page.getByRole('heading', { name: 'match', exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: 'Decision rules', exact: true }).fill('New rule'); await expect(page.getByRole('heading', { name: 'Ready to evaluate' })).toBeVisible()
  await page.getByRole('button', { name: /Plant check/ }).click(); await expect(page.locator('.uploaded-image')).toBeVisible(); await expect(page.getByRole('textbox', { name: 'Decision rules', exact: true })).toHaveValue(/Soil moisture/)
})
test('stale inference cannot overwrite newly edited criteria', async ({ page }) => {
  let release: (() => void) | undefined; const pending = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/decide', async route => { await pending; await route.fulfill({ json: result(route.request().postDataJSON().questions) }) })
  await page.goto('/'); await page.getByRole('button', { name: 'Make a decision' }).click(); await expect(page.getByRole('progressbar', { name: 'Inference in progress' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Decision rules', exact: true }).fill('New rules while pending'); release!()
  await expect(page.getByRole('heading', { name: 'Ready to evaluate' })).toBeVisible(); await expect(page.locator('.probability-placeholder')).toHaveText('—')
})
test('recording downloads a real video from the captured stream', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { value: async () => {
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360
      const context = canvas.getContext('2d')!; let n = 0; setInterval(() => { context.fillStyle = n++ % 2 ? '#234567' : '#abcdef'; context.fillRect(0, 0, 640, 360) }, 100)
      return canvas.captureStream(10)
    } })
  })
  await page.goto('/'); await page.getByRole('button', { name: 'Record', exact: true }).click(); await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible(); await page.waitForTimeout(1200)
  const saved = page.waitForEvent('download'); await page.getByRole('button', { name: 'Stop recording' }).click(); expect((await saved).suggestedFilename()).toMatch(/clef-session\.(webm|mp4)/)
})
test('narrow screen and portrait recording view have no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/'); await expect(page.getByRole('heading', { name: 'Dating profiles', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Focus view' }).click(); await page.getByRole('button', { name: 'Portrait 9:16' }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: test.info().outputPath('clef-verified-portrait.png'), fullPage: true })
  await page.getByRole('button', { name: 'Exit focus' }).click(); await expect(page.locator('.configuration')).toBeVisible()
})


test('another tab running a decision is visible and cannot be double-submitted', async ({ page }) => {
  let running = true; let calls = 0
  await page.route('**/api/status', route => route.fulfill({ json: { local: { status: 'ready' }, activeDecision: running ? { id: 'other-tab', experiment: 'Hot / not', provider: 'local', startedAt: new Date(Date.now() - 12000).toISOString() } : null, cloudflare: { configured: false } } }))
  await page.route('**/api/decide', route => { calls++; return route.fulfill({ json: result(route.request().postDataJSON().questions) }) })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Hot / not', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Waiting for GPU' })).toBeDisabled()
  await expect(page.locator('.decision-caption')).toContainText('Available when it finishes')
  await page.keyboard.press('Enter'); expect(calls).toBe(0)
  running = false
  await expect(page.getByRole('button', { name: 'Make a decision' })).toBeEnabled({ timeout: 7000 })
  await expect(page.getByRole('heading', { name: 'Ready to evaluate' })).toBeVisible()
})

test('preset results fit the panel and do not move the workspace', async ({ page }) => {
  await page.setViewportSize({ width: 1475, height: 768 })
  await page.route('**/api/decide', route => route.fulfill({ json: result(route.request().postDataJSON().questions) }))
  await page.goto('/')
  for (const name of ['Dating profiles', 'Thumbnail check', 'Marketplace finds', 'Neat / not', 'Plant check', 'Hot / not', 'Snack court', 'Art / trash', 'Desk verdict', 'Presentation', 'Color check', 'Object check']) {
    await page.getByRole('button', { name: new RegExp(name) }).click()
    await expect(page.getByRole('heading', { name: 'Ready to evaluate' })).toBeVisible()
    await page.waitForTimeout(250)
    const before = await page.locator('.experiment-workspace').boundingBox()
    expect(await page.locator('.decision-body').evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true)
    await page.getByRole('button', { name: 'Make a decision' }).click()
    await expect(page.getByRole('button', { name: 'Run again' })).toBeVisible()
    await page.waitForTimeout(400)
    expect(await page.locator('.decision-body').evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true)
    const after = await page.locator('.experiment-workspace').boundingBox()
    expect(after!.height).toBeCloseTo(before!.height, 1); expect(after!.y).toBeCloseTo(before!.y, 1)
    if (name === 'Neat / not') await page.screenshot({ path: test.info().outputPath('clef-neat.png'), fullPage: true })
  }
  await expect(page.locator('.rules-editor .context-footer')).toContainText('chars')
  await page.screenshot({ path: test.info().outputPath('clef-compact-color.png'), fullPage: true })
})

test('schema editor validates and renders changed questions live', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Edit schema' }).click()
  const editor = page.getByRole('textbox', { name: 'Question schema JSON' })
  await editor.fill(JSON.stringify({ action: { type: 'choice', instructions: 'Choose a fruit', criteria: { apple: 'A red apple', pear: 'A green pear' } } }))
  await expect(page.getByRole('region', { name: 'Live schema preview' })).toContainText('A green pear')
  await expect(page.getByRole('button', { name: 'Apply schema' })).toBeEnabled()
  await editor.fill('{broken')
  await expect(page.getByRole('button', { name: 'Apply schema' })).toBeDisabled()
  await expect(page.getByRole('region', { name: 'Live schema preview' })).toContainText('Preview paused')
})

test('a busy response names the job and its warning clears when the job finishes', async ({ page }) => {
  let active = false
  const job = { id: 'runtime-job', experiment: 'Hot / not', provider: 'local', startedAt: new Date().toISOString() }
  await page.route('**/api/status', route => route.fulfill({ json: { local: { status: 'ready', activeDecision: active ? job : null }, cloudflare: { configured: false } } }))
  await page.route('**/api/decide', route => { active = true; return route.fulfill({ status: 429, json: { error: 'Hot / not is running on the local GPU. Wait for it to finish.', activeDecision: job } }) })
  await page.goto('/'); await page.getByRole('button', { name: 'Make a decision' }).click()
  await expect(page.getByRole('alert')).toContainText('Hot / not')
  await expect(page.getByRole('button', { name: 'Waiting for GPU' })).toBeDisabled()
  active = false
  await expect(page.getByRole('button', { name: 'Make a decision' })).toBeEnabled({ timeout: 7000 })
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('portrait scan aligns with the card and leaves only a fading band', async ({ page }) => {
  await page.addInitScript(() => {
    const draw = WebGL2RenderingContext.prototype.drawArrays
    WebGL2RenderingContext.prototype.drawArrays = function(mode, first, count) {
      draw.call(this, mode, first, count)
      if (!(this.canvas instanceof HTMLCanvasElement) || !this.canvas.classList.contains('scan-shader')) return
      const pixels = new Uint8Array(this.drawingBufferWidth * 4)
      this.readPixels(0, Math.floor(this.drawingBufferHeight / 2), this.drawingBufferWidth, 1, this.RGBA, this.UNSIGNED_BYTE, pixels)
      ;(window as unknown as { scanAlpha: number[] }).scanAlpha = Array.from({ length: this.drawingBufferWidth }, (_, x) => pixels[x * 4 + 3])
    }
  })
  let release!: () => void; const pending = new Promise<void>(r => { release = r })
  await page.route('**/api/decide', async route => { await pending; await route.fulfill({ json: result(route.request().postDataJSON().questions) }) })
  await page.goto('/'); await page.getByRole('button', { name: 'Make a decision' }).click()
  await expect(page.locator('.profile-card .scan-shader')).toHaveCount(1)
  await page.waitForTimeout(2200)
  const alpha = await page.evaluate(() => (window as unknown as { scanAlpha: number[] }).scanAlpha)
  expect(alpha.some(a => a > 100)).toBe(true)
  expect(alpha.filter(a => a > 3).length).toBeLessThan(135)
  expect(alpha.filter(a => a === 0).length).toBeGreaterThan(alpha.length / 2)
  await expect(page.getByRole('alert')).toHaveCount(0)
  release(); await expect(page.getByRole('button', { name: 'Run again' })).toBeVisible()
})

test('multiple uploads run sequentially, retain results and stay with their experiment', async ({ page }) => {
  const images: string[] = []; let active = 0; let peak = 0
  await page.route('**/api/decide', async route => {
    const body = route.request().postDataJSON(); images.push(body.images[0]); active++; peak = Math.max(peak, active)
    const response = result(body.questions)
    if (images.length === 2) {
      const keys = Object.keys(body.questions.verdict.criteria)
      response.answers.verdict = { type: 'choice', choice: keys[1], confidence: 0.9, probabilities: Object.fromEntries(keys.map((key, i) => [key, i === 1 ? 0.9 : 0.1 / (keys.length - 1)])) }
    }
    await new Promise(resolve => setTimeout(resolve, 100)); active--; await route.fulfill({ json: response })
  })
  await page.setViewportSize({ width: 1475, height: 900 }); await page.goto('/')
  await page.getByRole('button', { name: /Art \/ trash/ }).click()
  await page.locator('input[type=file]').setInputFiles(['public/samples/market.jpg', 'public/samples/plant.jpg', 'public/samples/thumbnail.jpg'])
  const queue = page.getByRole('region', { name: 'Image queue' })
  await expect(queue.locator('.queue-thumbnail')).toHaveCount(3)
  await expect(queue.locator('.queue-heading')).toContainText('market.jpg')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await queue.getByRole('button', { name: 'Run queue' }).click()
  await expect(queue.getByRole('status')).toHaveText('Complete · 3/3 done')
  expect(images).toHaveLength(3); expect(new Set(images).size).toBe(3); expect(peak).toBe(1)
  await expect(queue.getByRole('button', { name: 'Run queue' })).toBeDisabled()
  await queue.getByRole('button', { name: 'Queue image 2: plant.jpg' }).click()
  await expect(page.getByRole('heading', { name: 'trash', exact: true })).toBeVisible()
  await queue.getByRole('button', { name: 'Previous queued image' }).click()
  await expect(page.getByRole('heading', { name: 'art', exact: true })).toBeVisible(); expect(images).toHaveLength(3)
  await page.screenshot({ path: test.info().outputPath('clef-image-queue.png'), fullPage: true })
  await page.getByRole('button', { name: /Plant check/ }).click(); await expect(queue).toHaveCount(0)
  await page.getByRole('button', { name: /Art \/ trash/ }).click(); await expect(queue.locator('.queue-thumbnail.done')).toHaveCount(3)
  await expect(page.getByRole('heading', { name: 'art', exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Run history/ }).click()
  await expect(page.locator('.history-row')).toHaveCount(3)
  await expect(page.locator('.history-list')).toContainText('market.jpg'); await expect(page.locator('.history-list')).toContainText('plant.jpg')
})

test('pause finishes only the current image and resume processes the remaining images', async ({ page }) => {
  let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve }); let calls = 0
  await page.route('**/api/decide', async route => { calls++; if (calls === 1) await pending; await route.fulfill({ json: result(route.request().postDataJSON().questions) }) })
  await page.goto('/'); await page.locator('input[type=file]').setInputFiles(['public/samples/market.jpg', 'public/samples/plant.jpg'])
  const queue = page.getByRole('region', { name: 'Image queue' }); await expect(queue.locator('.queue-thumbnail')).toHaveCount(2)
  await queue.getByRole('button', { name: 'Run queue' }).click(); await expect(page.getByRole('button', { name: 'Running decision' })).toBeVisible()
  await queue.getByRole('button', { name: 'Pause queue' }).click(); release()
  await expect(queue.getByRole('status')).toHaveText('Ready · 1/2 done'); await page.waitForTimeout(250); expect(calls).toBe(1)
  await queue.getByRole('button', { name: 'Run queue' }).click(); await expect(queue.getByRole('status')).toHaveText('Complete · 2/2 done'); expect(calls).toBe(2)
  await page.getByRole('textbox', { name: 'Decision rules', exact: true }).fill('New evaluation criteria')
  await expect(queue.getByRole('status')).toHaveText('Ready · 0/2 done'); await expect(page.getByRole('heading', { name: 'Ready to evaluate' })).toBeVisible()
  await queue.getByRole('button', { name: 'Clear image queue' }).click(); await expect(queue).toHaveCount(0); await expect(page.getByRole('heading', { name: 'No visual input' })).toBeVisible()
})

test('drop adds all images, additional uploads append, and invalid batches preserve the queue', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    const transfer = new DataTransfer()
    for (const [url, name] of [['/samples/market.jpg', 'chair.jpg'], ['/samples/plant.jpg', 'leaves.jpg']]) {
      const response = await fetch(url); transfer.items.add(new File([await response.blob()], name, { type: 'image/jpeg' }))
    }
    document.querySelector('.media-stage')!.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }))
  })
  const queue = page.getByRole('region', { name: 'Image queue' }); await expect(queue.locator('.queue-thumbnail')).toHaveCount(2)
  await page.locator('input[type=file]').setInputFiles('public/samples/thumbnail.jpg'); await expect(queue.locator('.queue-thumbnail')).toHaveCount(3)
  await expect(queue.locator('.queue-heading')).toContainText('thumbnail.jpg')
  await page.locator('input[type=file]').setInputFiles([{ name: 'valid.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(await page.request.get('/samples/market.jpg').then(r => r.body())) }, { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not a real PNG') }])
  await expect(page.getByRole('alert')).toContainText('broken.png'); await expect(queue.locator('.queue-thumbnail')).toHaveCount(3)
  await expect(queue.locator('.queue-heading')).toContainText('thumbnail.jpg')
})

test('changing rules during a queue stops automatic processing and rejects the outdated result', async ({ page }) => {
  let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve }); let calls = 0
  await page.route('**/api/decide', async route => { calls++; await pending; await route.fulfill({ json: result(route.request().postDataJSON().questions) }) })
  await page.goto('/'); await page.locator('input[type=file]').setInputFiles(['public/samples/market.jpg', 'public/samples/plant.jpg'])
  const queue = page.getByRole('region', { name: 'Image queue' }); await expect(queue.locator('.queue-thumbnail')).toHaveCount(2)
  await queue.getByRole('button', { name: 'Run queue' }).click(); await expect(page.getByRole('button', { name: 'Running decision' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Decision rules', exact: true }).fill('A different rubric'); release()
  await expect(page.getByRole('heading', { name: 'Ready to evaluate' })).toBeVisible()
  await expect(queue.getByRole('status')).toHaveText('Ready · 0/2 done'); await page.waitForTimeout(250); expect(calls).toBe(1)
})

test('a failed queue image stops the batch and retries only after an explicit resume', async ({ page }) => {
  const images: string[] = []
  await page.route('**/api/decide', route => {
    const body = route.request().postDataJSON(); images.push(body.images[0])
    return images.length === 2 ? route.fulfill({ status: 502, json: { error: 'Model rejected this frame.' } }) : route.fulfill({ json: result(body.questions) })
  })
  await page.goto('/'); await page.locator('input[type=file]').setInputFiles(['public/samples/market.jpg', 'public/samples/plant.jpg', 'public/samples/thumbnail.jpg'])
  const queue = page.getByRole('region', { name: 'Image queue' }); await expect(queue.locator('.queue-thumbnail')).toHaveCount(3)
  await queue.getByRole('button', { name: 'Run queue' }).click()
  await expect(page.getByRole('alert')).toContainText('Model rejected this frame.')
  await expect(queue.locator('.queue-thumbnail.error')).toHaveCount(1); await page.waitForTimeout(250); expect(images).toHaveLength(2)
  await queue.getByRole('button', { name: 'Run queue' }).click(); await expect(queue.getByRole('status')).toHaveText('Complete · 3/3 done')
  expect(images).toHaveLength(4); expect(images[2]).toBe(images[1]); expect(images[3]).not.toBe(images[1])
})

test('switching experiments pauses the queue and keeps the in-flight result with its image', async ({ page }) => {
  let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve }); let calls = 0
  await page.route('**/api/decide', async route => { calls++; await pending; await route.fulfill({ json: result(route.request().postDataJSON().questions) }) })
  await page.goto('/'); await page.locator('input[type=file]').setInputFiles(['public/samples/market.jpg', 'public/samples/plant.jpg'])
  const queue = page.getByRole('region', { name: 'Image queue' }); await expect(queue.locator('.queue-thumbnail')).toHaveCount(2)
  await queue.getByRole('button', { name: 'Run queue' }).click(); await expect(page.getByRole('button', { name: 'Running decision' })).toBeVisible()
  await page.getByRole('button', { name: /Art \/ trash/ }).click(); release()
  await expect(page.getByRole('heading', { name: 'Ready to evaluate' })).toBeVisible(); await expect(queue).toHaveCount(0)
  await page.getByRole('button', { name: /Dating profiles/ }).click(); await expect(queue.getByRole('status')).toHaveText('Ready · 1/2 done')
  await expect(page.getByRole('heading', { name: 'match', exact: true })).toBeVisible(); await page.waitForTimeout(250); expect(calls).toBe(1)
})

test('secondary answers show styled yes/no probabilities and score meters with the correct ranges', async ({ page }) => {
  let probability = 0.971
  await page.route('**/api/decide', route => {
    const response = result(route.request().postDataJSON().questions)
    if (response.answers.stressed) response.answers.stressed = { type: 'noul', noul: probability }
    return route.fulfill({ json: response })
  })
  await page.goto('/'); await page.getByRole('button', { name: /Plant check/ }).click()
  await page.getByRole('button', { name: 'Make a decision' }).click()
  const meter = page.getByRole('meter', { name: /stressed/ })
  await expect(meter).toHaveAttribute('aria-valuenow', '0.971'); await expect(page.locator('.extra-answer')).toContainText('Yes97.1%')
  await page.waitForTimeout(600); await page.screenshot({ path: test.info().outputPath('clef-secondary-answer.png'), fullPage: true })
  probability = 0.0379; await page.getByRole('button', { name: 'Run again' }).click()
  await expect(page.locator('.extra-answer')).toContainText('No96.2%'); await expect(meter).toHaveAttribute('aria-valuetext', '96.2% No')
  await page.getByRole('button', { name: /Thumbnail check/ }).click(); await page.getByRole('button', { name: 'Make a decision' }).click()
  const score = page.getByRole('meter', { name: 'clarity: score' }); await expect(score).toHaveAttribute('aria-valuemax', '3'); await expect(score).toHaveAttribute('aria-valuenow', '2.6')
})

for (const source of ['camera', 'screen'] as const) {
  test(`${source} shows the exact submitted frame during inference and resumes after the result`, async ({ page }) => {
    await page.addInitScript(() => {
      let color = '#e53935'; let calls = 0
      const capture = async () => {
        calls++
        const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360
        const ctx = canvas.getContext('2d')!
        const paint = () => { ctx.fillStyle = color; ctx.fillRect(0, 0, canvas.width, canvas.height) }
        paint(); setInterval(paint, 100)
        return canvas.captureStream(10)
      }
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: capture })
      Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { value: capture })
      Object.assign(window, { paintCapture: (next: string) => { color = next }, captureCalls: () => calls })
    })
    let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve }); let sentImage: string | undefined
    await page.route('**/api/decide', async route => { const body = route.request().postDataJSON(); sentImage = body.images[0]; await pending; await route.fulfill({ json: result(body.questions) }) })
    await page.goto('/'); await page.getByRole('button', { name: source === 'camera' ? 'Camera' : 'Screen / phone', exact: true }).click()
    const video = page.locator('.media-stage>video'); await expect.poll(() => video.evaluate(el => (el as HTMLVideoElement).videoWidth)).toBe(640)
    const streamId = await video.evaluate(el => ((el as HTMLVideoElement).srcObject as MediaStream).id)
    await page.getByRole('button', { name: 'Make a decision' }).click()
    const frame = page.getByRole('img', { name: 'Captured frame being evaluated' }); await expect(frame).toBeVisible(); await expect.poll(() => sentImage).toBeTruthy()
    expect(await frame.getAttribute('src')).toBe(sentImage); await expect(video).toBeHidden()
    await page.evaluate(() => (window as unknown as { paintCapture: (color: string) => void }).paintCapture('#2563eb'))
    await page.waitForTimeout(300); expect(await frame.getAttribute('src')).toBe(sentImage)
    release(); await expect(page.getByRole('button', { name: 'Run again' })).toBeVisible(); await expect(frame).toBeVisible()
    await page.waitForTimeout(400); await expect(frame).toBeVisible()
    await expect(frame).toHaveCount(0, { timeout: 2500 }); await expect(video).toBeVisible()
    expect(await video.evaluate(el => ((el as HTMLVideoElement).srcObject as MediaStream).id)).toBe(streamId)
    expect(await page.evaluate(() => (window as unknown as { captureCalls: () => number }).captureCalls())).toBe(1)
    await expect(page.getByRole('alert')).toHaveCount(0)
  })
}

test('changing the input during inference removes its frozen frame and does not restore it later', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360
    const ctx = canvas.getContext('2d')!; setInterval(() => { ctx.fillStyle = '#2563eb'; ctx.fillRect(0, 0, 640, 360) }, 100)
    return canvas.captureStream(10)
  } }))
  let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/decide', async route => { await pending; await route.fulfill({ json: result(route.request().postDataJSON().questions) }) })
  await page.goto('/'); await page.getByRole('button', { name: 'Camera', exact: true }).click()
  await expect.poll(() => page.locator('.media-stage>video').evaluate(el => (el as HTMLVideoElement).videoWidth)).toBe(640)
  await page.getByRole('button', { name: 'Make a decision' }).click(); await expect(page.getByRole('img', { name: 'Captured frame being evaluated' })).toBeVisible()
  await page.getByRole('button', { name: 'Text / JSON', exact: true }).click(); release()
  await expect(page.getByRole('heading', { name: 'No visual input' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Captured frame being evaluated' })).toHaveCount(0)
  await page.waitForTimeout(1300); await expect(page.locator('.media-stage>video')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Ready to evaluate' })).toBeVisible()
})

test('an uploaded video pauses on the captured frame and resumes its previous playback state', async ({ page }) => {
  let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve }); let sentImage: string | undefined
  await page.route('**/api/decide', async route => { const body = route.request().postDataJSON(); sentImage = body.images[0]; await pending; await route.fulfill({ json: result(body.questions) }) })
  await page.goto('/')
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360
    const ctx = canvas.getContext('2d')!; let tick = 0
    const paint = setInterval(() => { ctx.fillStyle = tick++ % 2 ? '#e53935' : '#2563eb'; ctx.fillRect(0, 0, 640, 360) }, 100)
    const stream = canvas.captureStream(10); const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' }); const chunks: Blob[] = []
    recorder.ondataavailable = event => chunks.push(event.data)
    const finished = new Promise<void>(resolve => { recorder.onstop = () => resolve() })
    recorder.start(); await new Promise(resolve => setTimeout(resolve, 2000)); recorder.stop(); await finished
    clearInterval(paint); stream.getTracks().forEach(track => track.stop())
    const files = new DataTransfer(); files.items.add(new File(chunks, 'clip.webm', { type: 'video/webm' }))
    document.querySelector('.media-stage')!.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: files }))
  })
  const video = page.locator('.media-stage>video'); await expect.poll(() => video.evaluate(el => (el as HTMLVideoElement).videoWidth)).toBe(640)
  await video.evaluate(el => (el as HTMLVideoElement).play())
  await page.getByRole('button', { name: 'Make a decision' }).click(); const frame = page.getByRole('img', { name: 'Captured frame being evaluated' }); await expect(frame).toBeVisible()
  expect(await frame.getAttribute('src')).toBe(sentImage)
  expect(await video.evaluate(el => (el as HTMLVideoElement).paused)).toBe(true)
  const position = await video.evaluate(el => (el as HTMLVideoElement).currentTime)
  await page.waitForTimeout(250); expect(await video.evaluate(el => (el as HTMLVideoElement).currentTime)).toBe(position)
  release(); await expect(page.getByRole('button', { name: 'Run again' })).toBeVisible(); await expect(frame).toBeVisible()
  await expect(frame).toHaveCount(0, { timeout: 2500 }); await expect.poll(() => video.evaluate(el => (el as HTMLVideoElement).paused)).toBe(false)
  await expect(page.getByRole('slider', { name: 'Video position' })).toBeEnabled()
  await video.evaluate(el => { (el as HTMLVideoElement).pause() })
  await page.getByRole('button', { name: 'Run again' }).click(); await expect(frame).toBeVisible()
  await expect(frame).toHaveCount(0, { timeout: 2500 }); expect(await video.evaluate(el => (el as HTMLVideoElement).paused)).toBe(true)
})

test('Android reconnect restores accessibility and source selection cannot silently switch to OCR', async ({ page }) => {
  let connected = false
  await page.route('**/api/android/devices', route => route.fulfill({ json: { devices: connected ? [{ serial: 'test-phone', state: 'device', model: 'Test_Phone' }] : [] } }))
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Android accessibility', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Read text', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Full profile', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('No Android device detected')
  connected = true
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Test Phone', exact: true })).toBeVisible({ timeout: 6000 })
  await page.keyboard.press('Escape')
  const source = page.getByRole('button', { name: 'Android accessibility', exact: true })
  await expect(source).toBeVisible({ timeout: 6000 })
  await expect(page.getByRole('button', { name: 'Full profile', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await source.click(); await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape'); await expect(source).toBeVisible()
  await source.click(); await page.getByRole('button', { name: 'Use image OCR', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Image OCR', exact: true })).toBeVisible()
  await page.waitForTimeout(3200)
  await expect(page.getByRole('button', { name: 'Image OCR', exact: true })).toBeVisible()
})

test('Android full read collects all details without OCR, then scores and reviews every photo in focus view', async ({ page }) => {
  let visibleIdentity = { name: 'Sofia', age: 29 }
  await page.route('**/api/android/profile-identity*', route => route.fulfill({ json: { available: true, profile: visibleIdentity } }))
  await page.route('**/api/android/devices', route => route.fulfill({ json: { devices: [{ serial: 'test-phone', state: 'device', model: 'Test_Phone' }] } }))
  await page.route('**/api/status', route => route.fulfill({ json: { local: { status: 'ready' }, ocr: { available: true, engine: 'Apple Vision' }, cloudflare: { configured: false } } }))
  let ocrCalls = 0; await page.route('**/api/profile-text', route => { ocrCalls++; return route.fulfill({ status: 500, json: { error: 'Android must not use OCR' } }) })
  await page.goto('/')
  const photos = await page.evaluate(() => ['#c44c44', '#449966', '#4455bb'].map(color => { const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 320; const ctx = canvas.getContext('2d')!; ctx.fillStyle = color; ctx.fillRect(0, 0, 160, 320); return canvas.toDataURL('image/png') }))
  let index = 2, expanded = false, detailPage = 0
  let releaseCapture!: () => void, releaseScore!: () => void
  const captureGate = new Promise<void>(resolve => { releaseCapture = resolve }), scoreGate = new Promise<void>(resolve => { releaseScore = resolve })
  const actions: string[] = []
  await page.route('**/api/android/profile-step', async route => {
    const body = route.request().postDataJSON(); actions.push(body.action)
    if (body.action !== 'capture') expect(body.expected).toEqual({ name: 'Sofia', age: 29 })
    if (body.action === 'previous-photo') { if (actions.length === 2) await captureGate; index-- }
    if (body.action === 'next-photo') index++
    if (body.action === 'open-bio') { expanded = true; detailPage = 0 }
    if (body.action === 'scroll-bio') detailPage = 1
    if (body.action === 'close-bio') expanded = false
    const header = { text: 'Sofia, 29', role: 'header', confidence: 1, bounds: { x: .1, y: .04, width: .7, height: .03 } }
    const rows = expanded ? detailPage === 0 ? [
      ['About Me', 'heading', 'About Me'], ['A complete paragraph, including text under the buttons.', 'text', 'About Me'],
      ['Essentials', 'heading', 'Essentials'], ['12 km away', 'text', 'Essentials'], ['165 cm', 'text', 'Essentials'],
      ['Interests', 'heading', 'Interests'], ['Nature', 'text', 'Interests'],
    ] : [['Lifestyle', 'heading', 'Lifestyle'], ['Non-smoker', 'text', 'Lifestyle'], ['My perfect Sunday', 'heading', 'My perfect Sunday'], ['Coffee and hiking', 'text', 'My perfect Sunday']] : [['Short-term fun', 'text', 'Relationship goals']]
    const lines = [header, ...rows.map(([text, role, section], i) => ({ text, role, section, confidence: 1, bounds: { x: .1, y: .2 + i * .07, width: .8, height: .04 } }))]
    return route.fulfill({ json: { image: photos[index], width: 160, height: 320, profile: { name: 'Sofia', age: 29 }, expanded, ...(!expanded || detailPage === 0 ? { pager: { index, count: 3 } } : {}), text: { engine: 'Android accessibility', text: lines.map(line => line.text).join('\n'), lines, ...(!expanded ? { photo_count: 3 } : {}), width: 160, height: 320, recognition_ms: 0 } } })
  })
  const requests: { state: Record<string, unknown>; images: string[]; questions: Record<string, { type: string; instructions: string; criteria?: string[] }> }[] = []
  await page.route('**/api/decide', async route => {
    const body = route.request().postDataJSON(); requests.push(body)
    if (requests.length === 1) await scoreGate
    const response = result(body.questions)
    response.answers.photo_attraction = { ...response.answers.photo_attraction, score: [0, 2.4, 2.7][requests.length - 1] }
    return route.fulfill({ json: response })
  })
  await expect(page.getByRole('button', { name: 'Android accessibility', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Full profile', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Read profile text', exact: true }).click()
  await expect(page.locator('.scan-collect .scan-hud')).toContainText('COLLECTING PROFILE')
  await expect(page.locator('.scan-shader')).toHaveAttribute('data-phase', 'collect')
  await expect(page.locator('.scan-score')).toHaveCount(0)
  expect(requests).toHaveLength(0)
  await page.screenshot({ path: test.info().outputPath('collecting-phase.png') })
  releaseCapture()
  const state = page.getByRole('textbox', { name: 'Decision state', exact: true })
  await expect(state).toHaveValue(/"My perfect Sunday"/)
  const profile = JSON.parse(await state.inputValue())
  expect(profile).toMatchObject({ name: 'Sofia', age: 29, distance_km: 12, photo_count: 3, bio: 'A complete paragraph, including text under the buttons.', interests: ['Nature'], sections: { Essentials: ['165 cm'], Lifestyle: ['Non-smoker'], 'Relationship goals': ['Short-term fun'], 'My perfect Sunday': ['Coffee and hiking'] } })
  expect(actions).toEqual(['capture', 'previous-photo', 'previous-photo', 'open-bio', 'scroll-bio', 'scroll-bio', 'close-bio'])
  expect(requests).toHaveLength(0); expect(ocrCalls).toBe(0)
  await page.getByRole('button', { name: 'Focus view', exact: true }).click()
  await page.getByRole('button', { name: 'Read + decide', exact: true }).click()
  await expect.poll(() => requests.length).toBe(1)
  await expect(page.locator('.scan-score .scan-hud')).toContainText('SCORING FRAME')
  await expect(page.locator('.scan-shader')).toHaveAttribute('data-phase', 'score')
  await expect(page.locator('.scan-collect')).toHaveCount(0)
  await page.waitForTimeout(1400)
  await page.screenshot({ path: test.info().outputPath('scoring-phase.png') })
  releaseScore()
  await expect.poll(() => requests.length).toBe(3)
  const summary = page.getByRole('region', { name: 'Combined profile scores' })
  await expect(summary).toContainText('COMBINED SCORE'); await expect(summary).toContainText('80.0'); await expect(summary).toContainText('3/3 scored')
  expect(new Set(requests.map(request => request.images[0])).size).toBe(3)
  for (const request of requests) { expect(request.state).toEqual(Object.fromEntries(Object.entries(profile).filter(([key]) => !['photo_results', 'combined_photo_score'].includes(key)))); expect(request.questions.photo_attraction.instructions).toContain('My preferences: 29-45, attractive, not overweight, into short term fun') }
  expect(ocrCalls).toBe(0)
  await page.getByRole('button', { name: 'Exit focus', exact: true }).click()
  const finalState = JSON.parse(await state.inputValue()); expect(finalState.photo_results.map((photo: { score_100: number }) => photo.score_100)).toEqual([0, 80, 90]); expect(finalState.combined_photo_score).toMatchObject({ score_100: 80, method: 'median', complete: true })
  const stage = await page.locator('.media-stage').boundingBox(), rail = await page.locator('.profile-rail').boundingBox(); expect(rail!.x + rail!.width).toBeLessThanOrEqual(stage!.x + 1); expect(stage!.height).toBeGreaterThan(500)
  await page.screenshot({ path: test.info().outputPath('native-profile-rail.png'), fullPage: true })
  await summary.getByRole('button', { name: 'Review photo 1 score' }).click()
  await expect(page.getByRole('meter', { name: 'photo attraction: score' })).toHaveAttribute('aria-valuenow', '0')
  await summary.getByRole('button', { name: 'Review photo 3 score' }).click()
  await expect(page.getByRole('meter', { name: 'photo attraction: score' })).toHaveAttribute('aria-valuenow', '2.7')
  visibleIdentity = { name: 'Maya', age: 31 }; await expect(page.locator('.next-profile-detected')).toContainText('Maya 31', { timeout: 5000 })
  expect(JSON.parse(await state.inputValue()).name).toBe('Sofia')
  await page.getByRole('button', { name: 'Reset profile', exact: true }).click(); await expect(state).toHaveValue(''); await expect(summary).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Decision rules', exact: true })).toHaveValue('My preferences: 29-45, attractive, not overweight, into short term fun')
})

test('photo review preserves the shared stream and returns to live without another capture permission', async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as Window & { previewCalls: number; previewTrack?: MediaStreamTrack }; state.previewCalls = 0
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { value: async () => {
      state.previewCalls++
      const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 800
      const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#456871'; ctx.fillRect(0, 0, 480, 800)
      const stream = canvas.captureStream(5); state.previewTrack = stream.getVideoTracks()[0]; return stream
    } })
  })
  await page.goto('/'); await page.getByRole('button', { name: 'Android accessibility', exact: true }).click(); await page.getByRole('button', { name: 'Use image OCR', exact: true }).click(); await page.getByRole('button', { name: 'Screen / phone', exact: true }).click()
  await expect.poll(() => page.locator('.media-stage>video').evaluate(el => (el as HTMLVideoElement).videoHeight)).toBe(800)
  await page.locator('input[type=file]').setInputFiles(['public/samples/market.jpg', 'public/samples/plant.jpg'])
  await page.getByRole('button', { name: /Queue image 2:/ }).click()
  await expect(page.getByRole('button', { name: 'Return to live preview', exact: true })).toBeVisible()
  expect(await page.evaluate(() => (window as Window & { previewTrack: MediaStreamTrack }).previewTrack.readyState)).toBe('live')
  await page.getByRole('button', { name: 'Return to live preview', exact: true }).click()
  await expect.poll(() => page.locator('.media-stage>video').evaluate(el => (el as HTMLVideoElement).videoHeight)).toBe(800)
  expect(await page.evaluate(() => (window as Window & { previewCalls: number }).previewCalls)).toBe(1)
  await page.getByRole('button', { name: /Queue image 1:/ }).click(); await page.getByRole('button', { name: 'Return to live preview', exact: true }).click()
  await expect(page.locator('.media-stage>video')).toBeVisible()
  const width = (await page.locator('.media-stage').boundingBox())!.width
  await page.getByRole('button', { name: 'Collapse profile panel', exact: true }).click()
  await expect(page.getByRole('complementary', { name: 'Profile capture and photo results' })).toBeHidden()
  expect((await page.locator('.media-stage').boundingBox())!.width).toBeGreaterThan(width + 200)
  await page.getByRole('button', { name: 'Expand profile panel', exact: true }).click()
  await expect(page.getByRole('complementary', { name: 'Profile capture and photo results' })).toBeVisible()
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Expand sidebar', exact: true })).toBeVisible()
  await expect.poll(() => page.locator('.sidebar').evaluate(el => Math.round(el.getBoundingClientRect().width))).toBe(66)
})
