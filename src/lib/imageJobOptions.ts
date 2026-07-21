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
  { value: 'completed', label: 'Completed' },
]

export const PURPOSE_LABELS: Record<ImageJobPurpose, string> = Object.fromEntries(
  PURPOSE_OPTIONS.map((option) => [option.value, option.label]),
) as Record<ImageJobPurpose, string>

export const STATUS_LABELS: Record<ImageJobStatus, string> = Object.fromEntries(
  STATUS_OPTIONS.map((option) => [option.value, option.label]),
) as Record<ImageJobStatus, string>

export type DimensionPreset = { label: string; width: number; height: number }

export const DIMENSION_PRESETS: DimensionPreset[] = [
  { label: 'YouTube thumbnail (1280×720)', width: 1280, height: 720 },
  { label: 'Pinterest image (1000×1500)', width: 1000, height: 1500 },
  { label: 'PDF cover (1275×1650)', width: 1275, height: 1650 },
  { label: 'Square (1024×1024)', width: 1024, height: 1024 },
]

// Pulled out as a pure function (rather than inlined in ImageGenerationTab)
// so the "duplicate" rule — new id/timestamps, no output, everything else
// carried over including the Design Brief reference — is independently
// testable without a React test setup this repo doesn't have.
export function duplicateImageJob(job: ImageJob, overrides?: { id?: string; now?: string }): ImageJob {
  const now = overrides?.now ?? new Date().toISOString()
  return {
    ...job,
    id: overrides?.id ?? crypto.randomUUID(),
    status: 'draft',
    output: null,
    originalFilename: null,
    createdAt: now,
    updatedAt: now,
  }
}
