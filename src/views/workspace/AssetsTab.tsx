import type { Asset, ImageJob } from '../../../shared/schema/project'
import { getAssetFileUrl, getImageJobFileUrl } from '../../lib/api'

type Props = {
  projectId: string
  imageJobs: ImageJob[]
  assets: Asset[]
}

export function AssetsTab({ projectId, imageJobs, assets }: Props) {
  const images = imageJobs.filter((job) => job.status === 'completed' && job.output)

  return (
    <div className="artifact-tab">
      <p className="tab-explanation">
        Review and download every image, narration file, rendered video, and document attached to this project.
      </p>

      <section className="idea-editor-group">
        <h3>Images</h3>
        {images.length === 0 ? (
          <p className="empty-hint">No completed images yet.</p>
        ) : (
          <ul className="asset-grid">
            {images.map((job) => (
              <li key={job.id}>
                <img src={getImageJobFileUrl(projectId, job.id)} alt={job.label || 'Project image'} />
                <strong>{job.label || 'Untitled image'}</strong>
                <span>
                  {job.width}×{job.height}
                </span>
                <a href={getImageJobFileUrl(projectId, job.id)} download={job.output?.fileName}>
                  Download image
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="idea-editor-group">
        <h3>Audio, video, and documents</h3>
        {assets.length === 0 ? (
          <p className="empty-hint">No rendered or imported assets yet.</p>
        ) : (
          <ul className="artifact-list">
            {assets.map((asset) => (
              <li key={asset.id}>
                <div>
                  <strong>{asset.fileName}</strong>
                  <span>
                    {asset.type} · {asset.source} · {new Date(asset.addedAt).toLocaleString()}
                  </span>
                </div>
                <a href={getAssetFileUrl(projectId, asset.id)} download={asset.fileName}>
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
