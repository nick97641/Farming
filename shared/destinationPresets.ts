import type { ModelProfile } from './modelProfiles.ts'

// Centrally-defined and versioned so presets can be corrected or extended as
// real platform requirements change, without ever claiming today's numbers
// are permanent. Bump DESTINATION_PRESETS_VERSION on any dimension/aspect
// change; a job's stored destination snapshot keeps whatever version it was
// created under, so old recipes remain an honest historical record.
export const DESTINATION_PRESETS_VERSION = 'destination-presets-v1'

export type DestinationOrientation = 'landscape' | 'portrait' | 'square'
export type DestinationCropBehavior = 'crop' | 'pad' | 'none'

export type DestinationPreset = {
  id: string
  label: string
  aspectRatio: { width: number; height: number }
  orientation: DestinationOrientation
  // Final, ready-to-use size for the destination — separate from native
  // generation dimensions, which depend on the selected model and are
  // resolved at generation time via resolveNativeDimensions below.
  exportWidth: number
  exportHeight: number
  compositionGuidance: string
  centerImportantContent: boolean
  cropBehavior: DestinationCropBehavior
}

export const DESTINATION_PRESETS: DestinationPreset[] = [
  {
    id: 'general-purpose',
    label: 'General purpose',
    aspectRatio: { width: 1, height: 1 },
    orientation: 'square',
    exportWidth: 1024,
    exportHeight: 1024,
    compositionGuidance: 'Balanced composition with the subject clearly visible from any crop angle.',
    centerImportantContent: true,
    cropBehavior: 'none',
  },
  {
    id: 'website',
    label: 'Website',
    aspectRatio: { width: 16, height: 9 },
    orientation: 'landscape',
    exportWidth: 1600,
    exportHeight: 900,
    compositionGuidance: 'Wide landscape composition, subject not too close to the left/right edges.',
    centerImportantContent: true,
    cropBehavior: 'none',
  },
  {
    id: 'blog-article',
    label: 'Blog or article',
    aspectRatio: { width: 4, height: 3 },
    orientation: 'landscape',
    exportWidth: 1200,
    exportHeight: 900,
    compositionGuidance: 'Clear single focal subject, works as a header image above article text.',
    centerImportantContent: true,
    cropBehavior: 'none',
  },
  {
    id: 'online-store',
    label: 'Online store',
    aspectRatio: { width: 1, height: 1 },
    orientation: 'square',
    exportWidth: 1200,
    exportHeight: 1200,
    compositionGuidance: 'Product-style framing, subject fully visible with clean, uncluttered background.',
    centerImportantContent: true,
    cropBehavior: 'pad',
  },
  {
    id: 'instagram-portrait',
    label: 'Instagram portrait',
    aspectRatio: { width: 4, height: 5 },
    orientation: 'portrait',
    exportWidth: 1080,
    exportHeight: 1350,
    compositionGuidance: 'Vertical framing, subject in the upper two-thirds to stay clear of the UI overlay.',
    centerImportantContent: true,
    cropBehavior: 'crop',
  },
  {
    id: 'instagram-square',
    label: 'Instagram square',
    aspectRatio: { width: 1, height: 1 },
    orientation: 'square',
    exportWidth: 1080,
    exportHeight: 1080,
    compositionGuidance: 'Centered square composition.',
    centerImportantContent: true,
    cropBehavior: 'crop',
  },
  {
    id: 'instagram-story',
    label: 'Instagram story or reel',
    aspectRatio: { width: 9, height: 16 },
    orientation: 'portrait',
    exportWidth: 1080,
    exportHeight: 1920,
    compositionGuidance: 'Tall vertical framing, keep the subject centered and clear of the top/bottom UI bars.',
    centerImportantContent: true,
    cropBehavior: 'crop',
  },
  {
    id: 'facebook-post',
    label: 'Facebook post',
    aspectRatio: { width: 1.91, height: 1 },
    orientation: 'landscape',
    exportWidth: 1200,
    exportHeight: 628,
    compositionGuidance: 'Wide landscape framing, keep the subject away from the far edges.',
    centerImportantContent: true,
    cropBehavior: 'crop',
  },
  {
    id: 'pinterest',
    label: 'Pinterest',
    aspectRatio: { width: 2, height: 3 },
    orientation: 'portrait',
    exportWidth: 1000,
    exportHeight: 1500,
    compositionGuidance: 'Tall vertical framing with room near the top for an overlaid title if added later.',
    centerImportantContent: true,
    cropBehavior: 'crop',
  },
  {
    id: 'youtube-thumbnail',
    label: 'YouTube thumbnail',
    aspectRatio: { width: 16, height: 9 },
    orientation: 'landscape',
    exportWidth: 1280,
    exportHeight: 720,
    compositionGuidance: 'High-contrast, single clear focal subject, legible at small sizes.',
    centerImportantContent: false,
    cropBehavior: 'crop',
  },
  {
    id: 'print',
    label: 'Print',
    aspectRatio: { width: 3, height: 2 },
    orientation: 'landscape',
    exportWidth: 1800,
    exportHeight: 1200,
    compositionGuidance: 'Leave a small safety margin near all edges for print trimming.',
    centerImportantContent: true,
    cropBehavior: 'pad',
  },
  {
    id: 'custom',
    label: 'Custom dimensions',
    aspectRatio: { width: 1, height: 1 },
    orientation: 'square',
    exportWidth: 1024,
    exportHeight: 1024,
    compositionGuidance: 'Balanced composition appropriate to the custom size chosen.',
    centerImportantContent: true,
    cropBehavior: 'none',
  },
]

export function getDestinationPreset(id: string): DestinationPreset {
  return DESTINATION_PRESETS.find((preset) => preset.id === id) ?? DESTINATION_PRESETS[0]
}

export function computeOrientation(width: number, height: number): DestinationOrientation {
  if (width === height) return 'square'
  return width > height ? 'landscape' : 'portrait'
}

export const MIN_CUSTOM_DIMENSION = 64
export const MAX_CUSTOM_DIMENSION = 8192

export function validateCustomDimensions(width: number, height: number): string | null {
  if (!Number.isInteger(width) || !Number.isInteger(height)) return 'Width and height must be whole numbers.'
  if (width < MIN_CUSTOM_DIMENSION || height < MIN_CUSTOM_DIMENSION) {
    return `Width and height must each be at least ${MIN_CUSTOM_DIMENSION} pixels.`
  }
  if (width > MAX_CUSTOM_DIMENSION || height > MAX_CUSTOM_DIMENSION) {
    return `Width and height must each be at most ${MAX_CUSTOM_DIMENSION} pixels.`
  }
  return null
}

// Never sends an arbitrary, model-incompatible size to Draw Things: resolves
// generation dimensions that (a) are valid for the given model profile
// (within its min/max, a multiple of its dimension step) and (b) match the
// destination's aspect ratio as closely as that step size allows. Export
// dimensions are handled entirely separately, after generation.
export function resolveNativeDimensions(
  aspectRatio: { width: number; height: number },
  modelProfile: Pick<ModelProfile, 'minDimension' | 'maxDimension' | 'dimensionStep'>,
): { width: number; height: number } {
  const { minDimension, maxDimension, dimensionStep } = modelProfile
  const targetArea = 1024 * 1024
  const ratio = aspectRatio.width / aspectRatio.height
  const rawHeight = Math.sqrt(targetArea / ratio)
  const rawWidth = rawHeight * ratio

  const snap = (value: number) => {
    const snapped = Math.round(value / dimensionStep) * dimensionStep
    return Math.min(maxDimension, Math.max(minDimension, snapped))
  }

  return { width: snap(rawWidth), height: snap(rawHeight) }
}
