import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { profileTextSchema } from '../src/lib/profile-ocr.ts'

const binary = fileURLToPath(new URL('../runtime/bin/profile-ocr', import.meta.url))
export const profileImageSchema = z.object({ image: z.string().regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/).pipe(z.string().refine(value => Buffer.byteLength(value.split(',')[1], 'base64') <= 4 * 1024 * 1024, 'Image exceeds 4 MiB.')) })
export function profileOCRStatus() { return { available: process.platform === 'darwin' && existsSync(binary), engine: 'Apple Vision' } }
export async function extractProfileText(image: string) {
  if (!profileOCRStatus().available) throw new Error('Profile OCR requires macOS and the native helper. Run npm run ocr:build first.')
  const bytes = Buffer.from(image.split(',')[1], 'base64')
  const output = await new Promise<string>((resolve, reject) => {
    const child = execFile(binary, [], { timeout: 15000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) { reject(new Error(stderr.trim() || error.message)); return }
      resolve(stdout)
    })
    child.stdin!.on('error', error => reject(error))
    child.stdin!.end(bytes)
  })
  return profileTextSchema.parse(JSON.parse(output))
}
