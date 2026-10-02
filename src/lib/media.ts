export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = name; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export async function imageData(source: CanvasImageSource, width: number, height: number): Promise<string> {
  if (!width || !height) throw new Error('The video has no frame yet. Wait for the preview to appear.')
  const scale = Math.min(1, 1280 / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable.')
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.86)
}
export async function loadImage(src: string) {
  const img = new Image(); img.src = src
  await img.decode()
  return img
}
export async function fileImage(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Upload a JPEG, PNG, or WebP image.')
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose an image under 20 MB. It will be resized before inference.')
  const url = URL.createObjectURL(file)
  try { const img = await loadImage(url); return await imageData(img, img.width, img.height) }
  finally { URL.revokeObjectURL(url) }
}
export async function shareCard(title: string, label: string, probability: number, latency: number, image: string | undefined, provider: string) {
  const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1350
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is unavailable.')
  ctx.fillStyle = '#f4f2eb'; ctx.fillRect(0, 0, 1080, 1350)
  ctx.fillStyle = '#24251f'; ctx.font = 'bold 34px sans-serif'; ctx.fillText('clef / studio', 64, 82)
  ctx.font = '20px monospace'; ctx.fillText('A VISION EXPERIMENT', 64, 127)
  ctx.save(); ctx.beginPath(); ctx.roundRect(64, 174, 952, 660, 28); ctx.clip(); ctx.fillStyle = '#deddd2'; ctx.fillRect(64, 174, 952, 660)
  if (image) {
    const img = await loadImage(image); const s = Math.max(952 / img.width, 660 / img.height)
    ctx.drawImage(img, 64 + (952 - img.width * s) / 2, 174 + (660 - img.height * s) / 2, img.width * s, img.height * s)
  } else { ctx.fillStyle = '#65665a'; ctx.font = '32px sans-serif'; ctx.fillText('Text-only experiment', 320, 500) }
  ctx.restore(); ctx.fillStyle = '#24251f'; ctx.font = '32px sans-serif'; ctx.fillText(title, 64, 905)
  ctx.font = 'bold 90px sans-serif'; ctx.fillText(label.toUpperCase().slice(0, 18), 64, 1010)
  ctx.fillStyle = '#e86a39'; ctx.font = 'bold 90px sans-serif'; ctx.fillText(`${(probability * 100).toFixed(1)}%`, 64, 1122)
  ctx.fillStyle = '#67685e'; ctx.font = '24px monospace'; ctx.fillText(`MODEL PROBABILITY · ${(latency / 1000).toFixed(2)}s`, 64, 1175)
  ctx.font = '21px sans-serif'; ctx.fillText(`Clef-flash / ${provider} · One model decision, not an objective verdict.`, 64, 1270)
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Export failed')), 'image/png'))
  download(blob, 'clef-decision.png')
}
