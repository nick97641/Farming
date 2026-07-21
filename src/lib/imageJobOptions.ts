import { DESTINATION_PRESETS_VERSION, getDestinationPreset, resolveNativeDimensions } from '../../shared/destinationPresets'
import { getModelProfile } from '../../shared/modelProfiles'
import type { ImageJob, ImageJobPurpose, ImageJobStatus } from '../../shared/schema/project'

export const PURPOSE_OPTIONS: { value: ImageJobPurpose; label: string }[] = [
  { value: 'pdf-cover', label: 'PDF cover' },
  { value: 'internal-illustration', label: 'Internal illustration' },
  { value: 'worksheet-graphic', label: 'Worksheet graphic' },
  { value: 'youtube-thumbnail', label: 'YouTube thumbnail' },
  { value: 'pinterest-image', label: 'Pinterest image' },
  { value: 'custom', label: 'Custom' },
]

export const STATUS_OPTIONS: { value: ImageJobStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'ready', label: 'Ready' },
]

export const PURPOSE_LABELS: Record<ImageJobPurpose, string> = Object.fromEntries(
  PURPOSE_OPTIONS.map((option) => [option.value, option.label]),
) as Record<ImageJobPurpose, string>

export const STATUS_LABELS: Record<ImageJobStatus, string> = {
  draft: 'Draft',
  ready: 'Ready',
  completed: 'Completed',
}

export type DimensionPreset = { label: string; width: number; height: number }

export const DIMENSION_PRESETS: DimensionPreset[] = [
  { label: 'YouTube thumbnail (1152×640)', width: 1152, height: 640 },
  { label: 'Pinterest image (768×1152)', width: 768, height: 1152 },
  { label: 'PDF cover (832×1088)', width: 832, height: 1088 },
  { label: 'Square (1024×1024)', width: 1024, height: 1024 },
]

const REQUIREMENTS: Record<
  ImageJobPurpose,
  { label: string; width: number; height: number; direction: string }
> = {
  'youtube-thumbnail': {
    label: 'YouTube thumbnail',
    width: 1152,
    height: 640,
    direction: 'high-contrast 16:9 thumbnail composition, one clear focal subject, leave clean space for title text',
  },
  'pdf-cover': {
    label: 'PDF cover',
    width: 832,
    height: 1088,
    direction: 'professional vertical guide cover, clear focal subject, generous clean space at the top for the title',
  },
  'worksheet-graphic': {
    label: 'Worksheet graphic',
    width: 1024,
    height: 1024,
    direction: 'simple educational diagram-like illustration, isolated subject, uncluttered light background',
  },
  'internal-illustration': {
    label: 'Internal illustration',
    width: 1024,
    height: 1024,
    direction: 'clear realistic educational illustration, simple composition, useful inside a beginner gardening guide',
  },
  'pinterest-image': {
    label: 'Pinterest image',
    width: 768,
    height: 1152,
    direction: 'vertical Pinterest composition, strong focal subject, clean space for a short headline',
  },
  custom: {
    label: 'Custom image',
    width: 1024,
    height: 1024,
    direction: 'clean professional educational gardening image, one clear focal subject, uncluttered composition',
  },
}

export function applyImageRequirements(
  job: ImageJob,
  context: { title: string; topic: string; visualDirection?: string },
): ImageJob {
  const requirement = REQUIREMENTS[job.purpose]
  const subject = context.title.trim() || context.topic.trim() || 'beginner hydroponics and small-space gardening'
  const topicLine = context.topic.trim() && context.topic.trim() !== subject ? ` Topic: ${context.topic.trim()}.` : ''
  const visualLine = context.visualDirection?.trim() ? ` Visual direction: ${context.visualDirection.trim()}.` : ''
  return {
    ...job,
    label: `${subject} — ${requirement.label}`,
    prompt: `Create a ${requirement.direction} for “${subject}”.${topicLine}${visualLine} Healthy plants, believable low-cost equipment, natural lighting, no logos, no watermark, do not render words or letters.`.trim(),
    negativePrompt:
      'blurry, low quality, cluttered background, dead plants, brown roots, distorted equipment, duplicate objects, people, hands, text, letters, logos, watermark',
    width: requirement.width,
    height: requirement.height,
    sourceType: 'generated',
    status: 'ready',
    updatedAt: new Date().toISOString(),
  }
}

// Applies a destination preset: stores a snapshot (never a live reference to
// the registry, so a later preset change never rewrites an already-generated
// job) and resolves model-compatible native generation dimensions separately
// from the preset's fixed export dimensions — never sends an arbitrary,
// unsupported size to Draw Things.
export function applyDestination(
  job: ImageJob,
  presetId: string,
  customExport?: { width: number; height: number },
): ImageJob {
  const preset = getDestinationPreset(presetId)
  const modelProfile = getModelProfile(job.modelProfileId)
  const exportWidth = presetId === 'custom' && customExport ? customExport.width : preset.exportWidth
  const exportHeight = presetId === 'custom' && customExport ? customExport.height : preset.exportHeight
  const aspectRatio = presetId === 'custom' && customExport ? { width: exportWidth, height: exportHeight } : preset.aspectRatio
  const native = resolveNativeDimensions(aspectRatio, modelProfile)
  return {
    ...job,
    width: native.width,
    height: native.height,
    destination: {
      presetId: preset.id,
      presetVersion: DESTINATION_PRESETS_VERSION,
      label: preset.label,
      aspectRatio,
      orientation: preset.orientation,
      exportWidth,
      exportHeight,
      compositionGuidance: preset.compositionGuidance,
      centerImportantContent: preset.centerImportantContent,
      cropBehavior: preset.cropBehavior,
    },
    updatedAt: new Date().toISOString(),
  }
}

// Pulled out as a pure function (rather than inlined in ImageGenerationTab)
// so the "duplicate" rule — new id/timestamps, no output, everything else
// carried over including the Design Brief reference — is independently
// testable without a React test setup this repo doesn't have. A plain
// duplicate is never part of the original's variation group (null) unless
// the caller explicitly supplies one, which is how a "generate N images"
// request links its sibling jobs together for display.
export function duplicateImageJob(
  job: ImageJob,
  overrides?: { id?: string; now?: string; variationGroupId?: string | null },
): ImageJob {
  const now = overrides?.now ?? new Date().toISOString()
  return {
    ...job,
    id: overrides?.id ?? crypto.randomUUID(),
    status: 'draft',
    output: null,
    originalFilename: null,
    variationGroupId: overrides?.variationGroupId ?? null,
    createdAt: now,
    updatedAt: now,
  }
}
