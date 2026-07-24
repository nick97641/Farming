import { useState } from 'react'

import { isImageJobSelectable, type DesignBrief, type ImageJob } from '../../../shared/schema/project'
import { getImageJobFileUrl } from '../../lib/api'
import { PURPOSE_LABELS, STATUS_LABELS } from '../../lib/imageJobOptions'

type Props = {
  projectId: string
  job: ImageJob
  designBrief: DesignBrief | null
  isSelected: boolean
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  onSelectImage: () => void
  onDeselectImage: () => void
}

export function ImageJobCard({
  projectId,
  job,
  designBrief,
  isSelected,
  onEdit,
  onDuplicate,
  onDelete,
  onSelectImage,
  onDeselectImage,
}: Props) {
  const [missing, setMissing] = useState(false)
  const stale = job.sourceDesignBriefUpdatedAt !== null && job.sourceDesignBriefUpdatedAt !== designBrief?.updatedAt
  const immutable = job.status === 'completed' || job.output !== null

  return (
    <li className="idea-card">
      <div className="idea-card-main">
        <div className="idea-card-header">
          <span className="idea-card-title">{job.label || '(untitled image job)'}</span>
          <span className={`idea-status-badge idea-status-${job.status}`}>{STATUS_LABELS[job.status]}</span>
          {stale && <span className="ai-badge">Design Brief has changed</span>}
          {isSelected && <span className="idea-selected-badge">Selected image</span>}
        </div>
        <div className="idea-card-meta">
          <span className="idea-card-tag">{PURPOSE_LABELS[job.purpose]}</span>
          <span className="idea-card-sources">
            {job.width}×{job.height}
          </span>
          {job.destination && <span className="idea-card-tag">{job.destination.label}</span>}
          {job.output && <span className="idea-card-sources">seed {job.advancedSettings.seed}</span>}
        </div>
        {job.prompt && <p className="idea-card-summary">{job.prompt}</p>}
        {job.output && !missing && (
          <img
            className="image-job-thumb"
            src={getImageJobFileUrl(projectId, job.id)}
            alt={job.label || 'Image job output'}
            onError={() => setMissing(true)}
          />
        )}
        {job.output && missing && <p className="error-text">File missing from disk</p>}
      </div>
      <div className="idea-card-actions">
        <button type="button" onClick={onEdit}>
          {immutable ? 'View' : 'Edit'}
        </button>
        <button type="button" onClick={onDuplicate}>
          Duplicate
        </button>
        {isImageJobSelectable(job) &&
          (isSelected ? (
            <button type="button" onClick={onDeselectImage}>
              Remove selection
            </button>
          ) : (
            <button type="button" onClick={onSelectImage}>
              Use this image
            </button>
          ))}
        <button type="button" className="danger-button" onClick={onDelete}>
          Delete
        </button>
      </div>
    </li>
  )
}
