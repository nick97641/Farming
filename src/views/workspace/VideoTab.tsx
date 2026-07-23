import { useEffect, useMemo, useState } from 'react'

import type { Asset, ImageJob } from '../../../shared/schema/project'
import { getAssetFileUrl, getImageJobFileUrl } from '../../lib/api'

type Props = {
  projectId: string
  script: string
  imageJobs: ImageJob[]
  assets: Asset[]
  rendering: boolean
  renderError: string | null
  onRender: (imageJobIds: string[], narration: File) => void
}

export function VideoTab({
  projectId,
  script,
  imageJobs,
  assets,
  rendering,
  renderError,
  onRender,
}: Props) {
  const availableImages = useMemo(
    () => imageJobs.filter((job) => job.status === 'completed' && job.output),
    [imageJobs],
  )
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [narration, setNarration] = useState<File | null>(null)
  const renderedVideos = assets.filter((asset) => asset.type === 'video')

  useEffect(() => {
    const availableIds = new Set(availableImages.map((job) => job.id))
    setSelectedIds((current) => current.filter((id) => availableIds.has(id)))
  }, [availableImages])

  function toggleImage(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id],
    )
  }

  function moveImage(index: number, offset: -1 | 1) {
    setSelectedIds((current) => {
      const target = index + offset
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  return (
    <div className="video-tab">
      <p className="tab-explanation">
        Create a local 1080p MP4 from your saved script, selected project images, and a narration file. Images
        display in the order below for equal portions of the narration.
      </p>

      <section className="idea-editor-group">
        <h3>1. Script</h3>
        {script.trim() ? (
          <p className="field-hint">Saved YouTube script ready ({script.trim().length.toLocaleString()} characters).</p>
        ) : (
          <p className="empty-hint">Create and save a YouTube script in the Content tab first.</p>
        )}
      </section>

      <section className="idea-editor-group">
        <h3>2. Images</h3>
        {availableImages.length === 0 ? (
          <p className="empty-hint">Complete or import at least one image in the Image Generation tab.</p>
        ) : (
          <div className="video-image-picker">
            {availableImages.map((job) => (
              <label key={job.id} className="video-image-choice">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(job.id)}
                  onChange={() => toggleImage(job.id)}
                  disabled={rendering}
                />
                <img src={getImageJobFileUrl(projectId, job.id)} alt="" />
                <span>{job.label || 'Untitled image'}</span>
              </label>
            ))}
          </div>
        )}
        {selectedIds.length > 0 && (
          <ol className="video-order-list">
            {selectedIds.map((id, index) => {
              const job = availableImages.find((candidate) => candidate.id === id)
              return (
                <li key={id}>
                  <span>{job?.label || 'Untitled image'}</span>
                  <button type="button" onClick={() => moveImage(index, -1)} disabled={rendering || index === 0}>
                    Move up
                  </button>
                  <button
                    type="button"
                    onClick={() => moveImage(index, 1)}
                    disabled={rendering || index === selectedIds.length - 1}
                  >
                    Move down
                  </button>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <section className="idea-editor-group">
        <h3>3. Narration and render</h3>
        <label className="field">
          Narration audio (WAV, MP3, or M4A; maximum 100MB)
          <input
            type="file"
            accept=".wav,.mp3,.m4a,audio/wav,audio/mpeg,audio/mp4"
            disabled={rendering}
            onChange={(event) => setNarration(event.target.files?.[0] ?? null)}
          />
        </label>
        <button
          type="button"
          disabled={rendering || !script.trim() || selectedIds.length === 0 || !narration}
          onClick={() => narration && onRender(selectedIds, narration)}
        >
          {rendering ? 'Rendering MP4...' : 'Render MP4'}
        </button>
        {renderError && <p className="error-text">{renderError}</p>}
      </section>

      <section className="idea-editor-group">
        <h3>Rendered videos</h3>
        {renderedVideos.length === 0 ? (
          <p className="empty-hint">No videos rendered yet.</p>
        ) : (
          <ul className="video-download-list">
            {renderedVideos.map((asset) => (
              <li key={asset.id}>
                <a href={getAssetFileUrl(projectId, asset.id)}>{asset.fileName}</a>
                <span>{new Date(asset.addedAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
