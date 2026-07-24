import type { DrawThingsSampler, ModelFamily } from './modelProfiles.ts'

// Centrally-defined and versioned, same reasoning as DESTINATION_PRESETS_VERSION
// in destinationPresets.ts — bump this if a preset's values are corrected, so a
// job's own advancedSettings (which a preset only ever seeds once, never binds
// to) remain an honest historical record regardless of later preset changes.
export const IMAGE_QUALITY_PRESETS_VERSION = 'image-quality-presets-v1'

// A named bundle of Draw Things generation parameters that produced good
// results for a specific model family in practice — never a claim that these
// are optimal for every prompt, and never applied automatically. Applying a
// preset only ever seeds sampler/steps/guidanceScale/clipSkip on the current
// job; it deliberately never touches width/height (those keep following the
// selected destination or the user's own choice) or seed/seedMode (seed stays
// whatever the job already had — random by default).
export type ImageQualityPreset = {
  id: string
  label: string
  modelFamily: ModelFamily
  sampler: DrawThingsSampler
  steps: number
  guidanceScale: number
  clipSkip: number
}

export const IMAGE_QUALITY_PRESETS: ImageQualityPreset[] = [
  {
    id: 'sdxl-realvisxl-quality',
    label: 'SDXL / RealVisXL — Quality (tested)',
    modelFamily: 'sdxl',
    sampler: 'DPM++ SDE Karras',
    steps: 32,
    guidanceScale: 5.0,
    clipSkip: 2,
  },
]

export function getImageQualityPreset(id: string): ImageQualityPreset | null {
  return IMAGE_QUALITY_PRESETS.find((preset) => preset.id === id) ?? null
}

// Scoped to one model family at a time — a preset tuned for SDXL has no
// verified meaning for Z-Image or FLUX, so it is never offered there.
export function getImageQualityPresetsForFamily(family: ModelFamily): ImageQualityPreset[] {
  return IMAGE_QUALITY_PRESETS.filter((preset) => preset.modelFamily === family)
}
