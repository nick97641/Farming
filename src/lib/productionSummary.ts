import type { DesignBrief } from '../../shared/schema/project'

export type TextReadiness = 'Ready' | 'Not created'

// "Ready" means real, non-whitespace content exists — a field containing
// only spaces/newlines is not meaningfully written yet, same bar as the rest
// of this codebase's non-whitespace checks (see e.g. the content-generation
// empty-response rejection).
export function getTextReadiness(value: string): TextReadiness {
  return value.trim().length > 0 ? 'Ready' : 'Not created'
}

export type DesignBriefReadiness = 'Ready' | 'Draft' | 'Not created'

export function getDesignBriefReadiness(designBrief: DesignBrief | null): DesignBriefReadiness {
  if (!designBrief) return 'Not created'
  return designBrief.status === 'ready' ? 'Ready' : 'Draft'
}
