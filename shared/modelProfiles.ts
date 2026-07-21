// A centrally-defined, versioned registry of local image-generation model
// families. Deliberately static rather than queried live from Draw Things —
// there is no confirmed "list available models" endpoint to verify without a
// running instance, so guessing one risks code that looks wired but silently
// fails. Bump MODEL_PROFILES_VERSION whenever an entry's compatibility rules
// change; existing recipes keep whatever version they were generated under.
export const MODEL_PROFILES_VERSION = 'model-profiles-v1'

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
  },
]

export const DEFAULT_MODEL_PROFILE_ID = MODEL_PROFILES[0].id

export function getModelProfile(id: string): ModelProfile {
  return MODEL_PROFILES.find((profile) => profile.id === id) ?? MODEL_PROFILES[0]
}

export function supportsControl(profile: Pick<ModelProfile, 'supportsCanny' | 'supportsDepth'>, type: 'canny' | 'depth'): boolean {
  return type === 'canny' ? profile.supportsCanny : profile.supportsDepth
}
