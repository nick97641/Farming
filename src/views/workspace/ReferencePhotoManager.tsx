import { useRef, useState } from 'react'

import type { ImageReference, ImageReferenceInfluence, ImageReferenceRole } from '../../../shared/schema/project'
import { getReferenceFileUrl } from '../../lib/api'

const ROLE_OPTIONS: { value: ImageReferenceRole; label: string }[] = [
  { value: 'match-subject', label: 'Match subject' },
  { value: 'match-composition', label: 'Match composition' },
  { value: 'match-structure-depth', label: 'Match structure or depth' },
  { value: 'match-edges-layout', label: 'Match edges or layout' },
  { value: 'match-style', label: 'Match visual style' },
  { value: 'general-inspiration', label: 'General inspiration' },
]

const INFLUENCE_OPTIONS: { value: ImageReferenceInfluence; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

const ROLE_LABELS: Record<ImageReferenceRole, string> = Object.fromEntries(
  ROLE_OPTIONS.map((option) => [option.value, option.label]),
) as Record<ImageReferenceRole, string>

type Props = {
  projectId: string
  jobId: string
  references: ImageReference[]
  disabled: boolean
  onImport: (file: File, role: ImageReferenceRole, influence: ImageReferenceInfluence) => void
  onRemove: (referenceId: string) => void
  importing: boolean
  importError: string | null
}

function ReferenceThumb({ projectId, jobId, reference }: { projectId: string; jobId: string; reference: ImageReference }) {
  const [missing, setMissing] = useState(false)
  if (missing) return <p className="error-text">File missing from disk</p>
  return (
    <img
      className="image-job-thumb"
      src={getReferenceFileUrl(projectId, jobId, reference.id)}
      alt={reference.originalFilename ?? 'Reference photo'}
      onError={() => setMissing(true)}
    />
  )
}

export function ReferencePhotoManager({
  projectId,
  jobId,
  references,
  disabled,
  onImport,
  onRemove,
  importing,
  importError,
}: Props) {
  const [pendingRole, setPendingRole] = useState<ImageReferenceRole>('general-inspiration')
  const [pendingInfluence, setPendingInfluence] = useState<ImageReferenceInfluence>('medium')
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) onImport(file, pendingRole, pendingInfluence)
    event.target.value = ''
  }

  return (
    <div className="reference-manager">
      {references.length > 0 && (
        <ul className="reference-list">
          {references.map((reference) => (
            <li key={reference.id} className="reference-card">
              <ReferenceThumb projectId={projectId} jobId={jobId} reference={reference} />
              <div className="reference-card-meta">
                <span>{ROLE_LABELS[reference.role]}</span>
                <span className="idea-card-tag">{reference.influence} influence</span>
                {reference.width && reference.height && (
                  <span className="field-hint">
                    {reference.width}×{reference.height}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="danger-button"
                onClick={() => onRemove(reference.id)}
                disabled={disabled}
                aria-label="Remove reference photo"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {!disabled && (
        <div className="reference-add-row">
          <label className="field">
            Purpose
            <select value={pendingRole} onChange={(event) => setPendingRole(event.target.value as ImageReferenceRole)}>
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Influence
            <select
              value={pendingInfluence}
              onChange={(event) => setPendingInfluence(event.target.value as ImageReferenceInfluence)}
            >
              {INFLUENCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileChosen} disabled={importing} />
        </div>
      )}
      {importing && <p>Adding reference photo...</p>}
      {importError && <p className="error-text">{importError}</p>}
    </div>
  )
}
