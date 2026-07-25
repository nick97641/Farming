import type { Project } from '../../../shared/schema/project'
import { getAssetFileUrl, getImageJobFileUrl } from '../../lib/api'
import { downloadTextFile } from '../../lib/download'
import { buildProductionSummary, safeArtifactBaseName } from '../../lib/projectArtifacts'

type Props = {
  project: Project
  onExportProjectJson: () => void
  onExportPdf: () => void
}

export function ExportTab({ project, onExportProjectJson, onExportPdf }: Props) {
  const base = safeArtifactBaseName(project.title)
  const completedImages = project.imageJobs.filter((job) => job.status === 'completed' && job.output)
  const hasScript = Boolean(project.content.longFormScript.trim())
  const hasPdf = Boolean(project.content.pdfDraft.trim())

  return (
    <div className="artifact-tab">
      <p className="tab-explanation">
        Download the project record and every finished production file from one place.
      </p>

      <section className="idea-editor-group">
        <h3>Project files</h3>
        <div className="artifact-actions">
          <button type="button" onClick={onExportProjectJson}>
            Download project JSON
          </button>
          <button
            type="button"
            onClick={() =>
              downloadTextFile(
                `${base}-production-summary.md`,
                buildProductionSummary(project),
                'text/markdown;charset=utf-8',
              )
            }
          >
            Download production summary
          </button>
          <button
            type="button"
            disabled={!hasScript}
            onClick={() =>
              downloadTextFile(
                `${base}-youtube-script.md`,
                project.content.longFormScript,
                'text/markdown;charset=utf-8',
              )
            }
          >
            Download YouTube script
          </button>
          <button type="button" disabled={!hasPdf} onClick={onExportPdf}>
            Download PDF guide
          </button>
        </div>
      </section>

      <section className="idea-editor-group">
        <h3>Generated images</h3>
        {completedImages.length === 0 ? (
          <p className="empty-hint">No completed images yet.</p>
        ) : (
          <ul className="artifact-list">
            {completedImages.map((job) => (
              <li key={job.id}>
                <div>
                  <strong>{job.label || 'Untitled image'}</strong>
                  <span>
                    {job.width}×{job.height}
                  </span>
                </div>
                <a href={getImageJobFileUrl(project.id, job.id)} download={job.output?.fileName}>
                  Download
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="idea-editor-group">
        <h3>Rendered and imported assets</h3>
        {project.assets.length === 0 ? (
          <p className="empty-hint">No assets yet.</p>
        ) : (
          <ul className="artifact-list">
            {project.assets.map((asset) => (
              <li key={asset.id}>
                <div>
                  <strong>{asset.fileName}</strong>
                  <span>{asset.type}</span>
                </div>
                <a href={getAssetFileUrl(project.id, asset.id)} download={asset.fileName}>
                  Download
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
