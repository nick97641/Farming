import { z } from 'zod'

// Read per-call, not captured once at module load: tests (and any other
// caller) that need to point at a different Draw Things instance — or
// deliberately at an unreachable one, to exercise the "Draw Things down"
// path without depending on whether a real instance happens to be running —
// can set process.env.DRAW_THINGS_URL right before calling.
function getDrawThingsUrl(): string {
  return (process.env.DRAW_THINGS_URL ?? 'http://127.0.0.1:7860').replace(/\/$/, '')
}

const DrawThingsResponseSchema = z.object({
  images: z.array(z.string()).min(1),
})

export class DrawThingsGenerationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DrawThingsGenerationError'
  }
}

export type DrawThingsControlInput = {
  type: 'canny' | 'depth'
  imageBase64: string
  weight: number
  preprocessing: boolean
  start: number
  end: number
}

export type DrawThingsGenerationInput = {
  prompt: string
  negativePrompt: string
  width: number
  height: number
  steps?: number
  guidanceScale?: number
  seed?: number
  // Must already be one of DRAW_THINGS_SAMPLERS (shared/modelProfiles.ts) —
  // callers validate this before reaching here (see the generate route).
  sampler?: string
  controls?: DrawThingsControlInput[]
}

// Only prompt/negative_prompt/width/height/steps/guidance_scale/seed/
// sampler_name/controlnet are sent — this is the boundary of what this
// checkpoint has reasonable confidence about, following Draw Things'
// existing A1111-compatible /sdapi/v1/txt2img surface and the commonly-used
// alwayson_scripts.controlnet convention for ControlNet-style guidance.
// There is deliberately no `scheduler` field: confirmed directly against the
// installed Draw Things HTTP API that /sdapi/v1/txt2img rejects the
// "scheduler" key outright ("Unrecognized keys: [\"scheduler\"]") regardless
// of value — scheduling is selected as part of sampler_name itself (e.g. the
// "Karras"/"Trailing"/"AYS" suffixed entries in DRAW_THINGS_SAMPLERS).
// CLIP skip, shift, refiner, upscaler, hi-res fix, face restoration,
// sharpness, and tiled decoding/diffusion are intentionally NOT sent here —
// they are captured in ImageAdvancedSettings for a complete, reproducible
// recipe, but their real Draw Things wire format hasn't been verified against
// a live instance, so guessing one risks code that looks wired but silently
// does nothing (or errors). Adjust this function once verified.
export function buildDrawThingsPayload(input: DrawThingsGenerationInput) {
  const payload: Record<string, unknown> = {
    prompt: input.prompt.trim(),
    negative_prompt: input.negativePrompt.trim(),
    width: input.width,
    height: input.height,
    steps: input.steps ?? 28,
    guidance_scale: input.guidanceScale ?? 6.5,
    seed: input.seed ?? -1,
    batch_count: 1,
    batch_size: 1,
  }
  if (input.sampler && input.sampler !== 'default') payload.sampler_name = input.sampler
  if (input.controls && input.controls.length > 0) {
    payload.alwayson_scripts = {
      controlnet: {
        args: input.controls.map((control) => ({
          input_image: control.imageBase64,
          module: control.type,
          weight: control.weight,
          processor_res: control.preprocessing ? 512 : 0,
          guidance_start: control.start,
          guidance_end: control.end,
        })),
      },
    }
  }
  return payload
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
  const drawThingsUrl = getDrawThingsUrl()
  let response: Response
  try {
    response = await fetchImpl(`${drawThingsUrl}/sdapi/v1/txt2img`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildDrawThingsPayload(input)),
      signal: AbortSignal.timeout(10 * 60_000),
    })
  } catch (error) {
    throw new DrawThingsGenerationError(
      `Could not reach Draw Things at ${drawThingsUrl}: ${error instanceof Error ? error.message : 'unknown error'}`,
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

const DrawThingsOptionsSchema = z.object({ model: z.string().optional() }).passthrough()

// Reports the model Draw Things is actually using right now, via
// GET /sdapi/v1/options — confirmed to work directly against the installed
// API (it returns the active checkpoint's filename as the "model" field).
// This is read-only: confirmed separately that /sdapi/v1/options accepts
// only GET (POST/PUT both 404), so there is no way for this app to SELECT a
// model through this endpoint, only to read back whichever one Draw Things
// already has loaded. Never guess a value — returns null whenever the
// endpoint can't be reached or the response doesn't include a model field,
// so a failed lookup is visibly "unknown" rather than silently wrong.
export async function getActiveDrawThingsModel(fetchImpl: typeof fetch = fetch): Promise<string | null> {
  let response: Response
  try {
    response = await fetchImpl(`${getDrawThingsUrl()}/sdapi/v1/options`, { signal: AbortSignal.timeout(10_000) })
  } catch {
    return null
  }
  if (!response.ok) return null
  let parsed: unknown
  try {
    parsed = await response.json()
  } catch {
    return null
  }
  const result = DrawThingsOptionsSchema.safeParse(parsed)
  if (!result.success || !result.data.model) return null
  return result.data.model
}
