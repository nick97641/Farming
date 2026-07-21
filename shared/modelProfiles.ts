import { z } from 'zod'

// A centrally-defined, versioned registry of local image-generation model
// families. Deliberately static rather than queried live from Draw Things —
// there is no confirmed "list available models" endpoint to verify without a
// running instance, so guessing one risks code that looks wired but silently
// fails. Bump MODEL_PROFILES_VERSION whenever an entry's compatibility rules
// change; existing recipes keep whatever version they were generated under.
export const MODEL_PROFILES_VERSION = 'model-profiles-v1'

// The complete, verified set of `sampler_name` values the installed Draw
// Things HTTP API accepts — obtained directly from its own 422 rejection of
// an invalid value ("Invalid value for sampler_name (options: [...])"), not
// guessed or inferred from documentation. 'default' is our own sentinel
// (never sent to Draw Things — see draw-things-client.ts) meaning "let Draw
// Things use whatever it would use on its own."
export const DRAW_THINGS_SAMPLERS = [
  'default',
  'DPM++ 2M Karras',
  'Euler a',
  'DDIM',
  'PLMS',
  'DPM++ SDE Karras',
  'UniPC',
  'LCM',
  'Euler A Substep',
  'DPM++ SDE Substep',
  'TCD',
  'Euler A Trailing',
  'DPM++ SDE Trailing',
  'DPM++ 2M AYS',
  'Euler A AYS',
  'DPM++ SDE AYS',
  'DPM++ 2M Trailing',
  'DDIM Trailing',
  'UniPC Trailing',
  'UniPC AYS',
  'TCD Trailing',
] as const
export const DrawThingsSamplerSchema = z.enum(DRAW_THINGS_SAMPLERS)
export type DrawThingsSampler = z.infer<typeof DrawThingsSamplerSchema>

// Confirmed directly against the installed Draw Things HTTP API: its
// /sdapi/v1/txt2img endpoint has no separate scheduler parameter at all —
// sending one of any value (`{"scheduler": "..."}`) is rejected outright
// with "Unrecognized keys: [\"scheduler\"]", not merely an invalid-value
// error. Scheduling is selected as part of the sampler_name itself (e.g. the
// "Karras"/"Trailing"/"AYS" suffixed entries above). 'default' — meaning
// "don't send a scheduler field" — is therefore the only value that can ever
// actually work; anything else is rejected locally before ever reaching
// Draw Things (see the generate route).
export const DRAW_THINGS_SCHEDULERS = ['default'] as const
export const DrawThingsSchedulerSchema = z.enum(DRAW_THINGS_SCHEDULERS)
export type DrawThingsScheduler = z.infer<typeof DrawThingsSchedulerSchema>

export type ModelFamily = 'sdxl' | 'z-image' | 'flux' | 'other'

export type ModelProfile = {
  id: string
  label: string
  family: ModelFamily
  // Canny/Depth ControlNet-style guidance is only offered for families that
  // actually support it — never silently enabled for an incompatible model.
  supportsCanny: boolean
  supportsDepth: boolean
  minDimension: number
  maxDimension: number
  dimensionStep: number
  // Model-appropriate negative terms merged in alongside the user's own
  // negative prompt and the policy-derived prohibitions — never replacing
  // either, and itself checked against locked required facts.
  safeNegativeDefaults: string[]
  // Every profile references the SAME exported, Draw-Things-confirmed lists
  // above — there is no evidence of per-model sampler/scheduler differences
  // (Draw Things reported one global list, not a per-model one), so
  // inventing per-profile subsets here would itself be guessing.
  supportedSamplers: readonly DrawThingsSampler[]
  supportedSchedulers: readonly DrawThingsScheduler[]
}

export const MODEL_PROFILES: ModelProfile[] = [
  {
    id: 'sdxl-base',
    label: 'SDXL (general purpose)',
    family: 'sdxl',
    supportsCanny: true,
    supportsDepth: true,
    minDimension: 256,
    maxDimension: 2048,
    dimensionStep: 64,
    safeNegativeDefaults: ['blurry', 'low quality', 'distorted anatomy'],
    supportedSamplers: DRAW_THINGS_SAMPLERS,
    supportedSchedulers: DRAW_THINGS_SCHEDULERS,
  },
  {
    id: 'z-image',
    label: 'Z-Image',
    family: 'z-image',
    supportsCanny: false,
    supportsDepth: false,
    minDimension: 256,
    maxDimension: 2048,
    dimensionStep: 64,
    safeNegativeDefaults: ['blurry', 'low quality'],
    supportedSamplers: DRAW_THINGS_SAMPLERS,
    supportedSchedulers: DRAW_THINGS_SCHEDULERS,
  },
  {
    id: 'flux',
    label: 'FLUX',
    family: 'flux',
    supportsCanny: false,
    supportsDepth: false,
    minDimension: 256,
    maxDimension: 2048,
    dimensionStep: 64,
    safeNegativeDefaults: ['blurry', 'low quality'],
    supportedSamplers: DRAW_THINGS_SAMPLERS,
    supportedSchedulers: DRAW_THINGS_SCHEDULERS,
  },
]

export const DEFAULT_MODEL_PROFILE_ID = MODEL_PROFILES[0].id

export function getModelProfile(id: string): ModelProfile {
  return MODEL_PROFILES.find((profile) => profile.id === id) ?? MODEL_PROFILES[0]
}

export function supportsControl(profile: Pick<ModelProfile, 'supportsCanny' | 'supportsDepth'>, type: 'canny' | 'depth'): boolean {
  return type === 'canny' ? profile.supportsCanny : profile.supportsDepth
}

export function supportsSampler(profile: Pick<ModelProfile, 'supportedSamplers'>, sampler: string): boolean {
  return (profile.supportedSamplers as readonly string[]).includes(sampler)
}

export function supportsScheduler(profile: Pick<ModelProfile, 'supportedSchedulers'>, scheduler: string): boolean {
  return (profile.supportedSchedulers as readonly string[]).includes(scheduler)
}
