import type { ImageControlType, ImageReferenceInfluence, ImageReferenceRole } from './schema/project.ts'
import type { ModelProfile } from './modelProfiles.ts'
import { supportsControl } from './modelProfiles.ts'

// Which advanced control (if any) a simple reference role translates to.
// 'match-subject', 'match-style', and 'general-inspiration' have no
// ControlNet-style equivalent in this checkpoint — they influence generation
// only through the reference being present, not a structural control.
export function roleToControlType(role: ImageReferenceRole): ImageControlType | null {
  if (role === 'match-edges-layout' || role === 'match-composition') return 'canny'
  if (role === 'match-structure-depth') return 'depth'
  return null
}

// Simple Low/Medium/High influence translated into a concrete control
// weight — shown to the user as the "effective settings" before generation,
// never silently applied without being visible.
export function influenceToWeight(influence: ImageReferenceInfluence): number {
  if (influence === 'low') return 0.3
  if (influence === 'high') return 0.9
  return 0.6
}

export type ReferenceControlSuggestion = {
  type: ImageControlType
  weight: number
  preprocessing: boolean
  start: number
  end: number
} | null

// Combines the role→control and influence→weight translations into a
// complete suggested control, but only when the selected model actually
// supports that control type — never silently enabling an incompatible
// control for a model that doesn't (e.g. Z-Image or FLUX).
export function suggestControlForReference(
  role: ImageReferenceRole,
  influence: ImageReferenceInfluence,
  modelProfile: Pick<ModelProfile, 'supportsCanny' | 'supportsDepth'>,
): ReferenceControlSuggestion {
  const type = roleToControlType(role)
  if (!type) return null
  if (!supportsControl(modelProfile, type)) return null
  return {
    type,
    weight: influenceToWeight(influence),
    preprocessing: true,
    start: 0,
    end: 1,
  }
}
