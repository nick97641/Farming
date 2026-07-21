import { z } from 'zod'

const DRAW_THINGS_URL = (process.env.DRAW_THINGS_URL ?? 'http://127.0.0.1:7860').replace(/\/$/, '')

const DrawThingsResponseSchema = z.object({
  images: z.array(z.string()).min(1),
})

export class DrawThingsGenerationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DrawThingsGenerationError'
  }
}

export type DrawThingsGenerationInput = {
  prompt: string
  negativePrompt: string
  width: number
  height: number
}

export function buildDrawThingsPayload(input: DrawThingsGenerationInput) {
  return {
    prompt: input.prompt.trim(),
    negative_prompt: input.negativePrompt.trim(),
    width: input.width,
    height: input.height,
    steps: 28,
    guidance_scale: 6.5,
    seed: -1,
    batch_count: 1,
    batch_size: 1,
  }
}

export function decodeDrawThingsImage(encoded: string): Buffer {
  const base64 = encoded.startsWith('data:') ? encoded.slice(encoded.indexOf(',') + 1) : encoded
  if (!base64 || !/^[A-Za-z0-9+/=\r\n]+$/.test(base64)) {
    throw new DrawThingsGenerationError('Draw Things returned malformed image data')
  }
  const buffer = Buffer.from(base64, 'base64')
  if (buffer.length === 0) throw new DrawThingsGenerationError('Draw Things returned an empty image')
  return buffer
}

export async function generateWithDrawThings(
  input: DrawThingsGenerationInput,
  fetchImpl: typeof fetch = fetch,
): Promise<Buffer> {
  let response: Response
  try {
    response = await fetchImpl(`${DRAW_THINGS_URL}/sdapi/v1/txt2img`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildDrawThingsPayload(input)),
      signal: AbortSignal.timeout(10 * 60_000),
    })
  } catch (error) {
    throw new DrawThingsGenerationError(
      `Could not reach Draw Things at ${DRAW_THINGS_URL}: ${error instanceof Error ? error.message : 'unknown error'}`,
    )
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new DrawThingsGenerationError(
      `Draw Things responded with status ${response.status}${detail ? `: ${detail.slice(0, 240)}` : ''}`,
    )
  }

  let parsed: unknown
  try {
    parsed = await response.json()
  } catch {
    throw new DrawThingsGenerationError('Draw Things returned a response that was not valid JSON')
  }
  const result = DrawThingsResponseSchema.safeParse(parsed)
  if (!result.success) throw new DrawThingsGenerationError('Draw Things response did not include an image')
  return decodeDrawThingsImage(result.data.images[0])
}
