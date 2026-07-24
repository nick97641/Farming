import type { DesignBrief, IdeaPublicationInfo } from '../../shared/schema/project'

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

// True when any of the four fields has real, non-whitespace content — used
// to decide whether there is anything to show at all, never to gate which
// individual fields render (each field is shown independently once this is
// true).
export function hasPublicationInfo(publication: IdeaPublicationInfo): boolean {
  return (
    publication.url.trim().length > 0 ||
    publication.publishedAt.trim().length > 0 ||
    publication.platform.trim().length > 0 ||
    publication.notes.trim().length > 0
  )
}

// Only http/https URLs are ever rendered as a clickable link. Anything else —
// javascript:, data:, mailto:, a bare string with no scheme, or a malformed
// value the URL constructor can't parse at all — is shown as plain text
// instead, so a manually-typed field can never turn into an unexpected
// navigation or script execution.
export function isSafeWebUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
