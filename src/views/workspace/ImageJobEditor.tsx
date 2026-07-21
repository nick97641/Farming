import { useRef, useState } from 'react'

import type { DesignBrief, ImageJob } from '../../../shared/schema/project'
import { getImageJobFileUrl } from '../../lib/api'
import { DIMENSION_PRESETS, PURPOSE_OPTIONS, STATUS_OPTIONS } from '../../lib/imageJobOptions'

type Props = {
  projectId: string
  job: ImageJob
  designBrief: DesignBrief | null
  onChange: (job: ImageJob) => void
  onClose: () => void
  onDelete: () => void
  onImport: (file: File) => void
  importing: boolean
  importError: string | null
}

export function ImageJobEditor({
  projectId,
  job,
  designBrief,
  onChange,
  onClose,
  onDelete,
  onImport,
  importing,
  importError,
}: Props) {
  const [missing, setMissing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const stale = job.sourceDesignBriefUpdatedAt !== null && job.sourceDesignBriefUpdatedAt !== designBrief?.updatedAt
  const immutable = job.status === 'completed' || job.output !== null

  function patch(fields: Partial<ImageJob>) {
    if (immutable) return
    onChange({ ...job, ...fields, updatedAt: new Date().toISOString() })
  }

  function handleFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) onImport(file)
    event.target.value = ''
  }

  const matchingPreset = DIMENSION_PRESETS.find((preset) => preset.width === job.width && preset.height === job.height)

  return (
    <div className="idea-editor">
      <div className="idea-editor-toolbar">
        <button type="button" onClick={onClose}>
          &larr; Back to image jobs
        </button>
        <button type="button" className="danger-button" onClick={onDelete}>
          Delete image job
        </button>
      </div>

      {stale && (
        <p className="design-brief-mismatch-warning">
          The Design Brief has changed since this job was created. The prompt below will not update automatically —
          review it against the current brief if needed.
        </p>
      )}

      {immutable && (
        <p className="empty-hint">This completed job is immutable. Duplicate it to create another variation.</p>
      )}

      <fieldset className="idea-editor-group" disabled={immutable}>
        <h3>Core</h3>
        <label className="field">
          Label
          <input value={job.label} onChange={(event) => patch({ label: event.target.value })} />
        </label>
        <label className="field">
          Purpose
          <select value={job.purpose} onChange={(event) => patch({ purpose: event.target.value as ImageJob['purpose'] })}>
            {PURPOSE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Status
          <select value={job.status} onChange={(event) => patch({ status: event.target.value as ImageJob['status'] })}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset className="idea-editor-group" disabled={immutable}>
        <h3>Prompt</h3>
        <label className="field">
          Prompt
          <textarea rows={4} value={job.prompt} onChange={(event) => patch({ prompt: event.target.value })} />
        </label>
        <label className="field">
          Negative prompt
          <textarea
            rows={2}
            value={job.negativePrompt}
            onChange={(event) => patch({ negativePrompt: event.target.value })}
          />
        </label>
        <label className="field">
          Dimension preset
          <select
            value={matchingPreset?.label ?? 'custom'}
            onChange={(event) => {
              const preset = DIMENSION_PRESETS.find((p) => p.label === event.target.value)
              if (preset) patch({ width: preset.width, height: preset.height })
            }}
          >
            {DIMENSION_PRESETS.map((preset) => (
              <option key={preset.label} value={preset.label}>
                {preset.label}
              </option>
            ))}
            <option value="custom">Custom</option>
          </select>
        </label>
        <div className="image-job-dimensions">
          <label className="field">
            Width
            <input
              type="number"
              min={1}
              value={job.width}
              onChange={(event) => patch({ width: Number(event.target.value) || job.width })}
            />
          </label>
          <label className="field">
            Height
            <input
              type="number"
              min={1}
              value={job.height}
              onChange={(event) => patch({ height: Number(event.target.value) || job.height })}
            />
          </label>
        </div>
      </fieldset>

      <section className="idea-editor-group">
        <h3>Image</h3>
        {job.output ? (
          <>
            {!missing && (
              <img
                className="image-job-preview"
                src={getImageJobFileUrl(projectId, job.id)}
                alt={job.label || 'Image job output'}
                onError={() => setMissing(true)}
              />
            )}
            {missing && <p className="error-text">File missing from disk</p>}
            {job.originalFilename && <p className="field-hint">Originally uploaded as: {job.originalFilename}</p>}
          </>
        ) : (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileChosen}
              disabled={importing}
            />
            {importing && <p>Importing...</p>}
            {importError && <p className="error-text">{importError}</p>}
          </>
        )}
      </section>
    </div>
  )
}
