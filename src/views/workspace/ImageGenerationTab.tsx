import { useState } from 'react'

import type { DesignBrief, ImageJob } from '../../../shared/schema/project'
import { duplicateImageJob } from '../../lib/imageJobOptions'
import { ImageJobCard } from './ImageJobCard'
import { ImageJobEditor } from './ImageJobEditor'

type Props = {
  projectId: string
  imageJobs: ImageJob[]
  designBrief: DesignBrief | null
  onChangeImageJobs: (jobs: ImageJob[]) => void
  onImport: (jobId: string, file: File) => void
  importingJobId: string | null
  importError: string | null
  onDeleteJob: (jobId: string, label: string) => void
}

function createBlankJob(designBrief: DesignBrief | null): ImageJob {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    sourceDesignBriefUpdatedAt: designBrief?.updatedAt ?? null,
    purpose: 'custom',
    label: designBrief?.title ?? '',
    status: 'draft',
    prompt: designBrief?.visualDirection ?? '',
    negativePrompt: '',
    width: 1024,
    height: 1024,
    sourceType: 'imported',
    output: null,
    originalFilename: null,
    createdAt: now,
    updatedAt: now,
  }
}

export function ImageGenerationTab({
  projectId,
  imageJobs,
  designBrief,
  onChangeImageJobs,
  onImport,
  importingJobId,
  importError,
  onDeleteJob,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const editingJob = imageJobs.find((job) => job.id === editingId) ?? null

  function handleCreate() {
    const blank = createBlankJob(designBrief)
    onChangeImageJobs([...imageJobs, blank])
    setEditingId(blank.id)
  }

  function handleUpdate(updated: ImageJob) {
    onChangeImageJobs(
      imageJobs.map((job) =>
        job.id === updated.id && job.status !== 'completed' && job.output === null ? updated : job,
      ),
    )
  }

  function handleDuplicate(job: ImageJob) {
    onChangeImageJobs([...imageJobs, duplicateImageJob(job)])
  }

  function handleDelete(job: ImageJob) {
    onDeleteJob(job.id, job.label)
    if (editingId === job.id) setEditingId(null)
  }

  if (editingJob) {
    return (
      <ImageJobEditor
        projectId={projectId}
        job={editingJob}
        designBrief={designBrief}
        onChange={handleUpdate}
        onClose={() => setEditingId(null)}
        onDelete={() => handleDelete(editingJob)}
        onImport={(file) => onImport(editingJob.id, file)}
        importing={importingJobId === editingJob.id}
        importError={importError}
      />
    )
  }

  return (
    <div className="image-jobs-tab">
      <p className="tab-explanation">
        Create image jobs for this project&apos;s covers, thumbnails, and illustrations. Write a prompt and target
        dimensions, then import a locally generated or sourced image into each job — direct generation isn&apos;t
        available yet.
      </p>

      <button type="button" onClick={handleCreate}>
        Create image job
      </button>

      {imageJobs.length === 0 && <p className="empty-hint">No image jobs yet — create one above.</p>}

      {imageJobs.length > 0 && (
        <ul className="idea-list">
          {imageJobs.map((job) => (
            <ImageJobCard
              key={job.id}
              projectId={projectId}
              job={job}
              designBrief={designBrief}
              onEdit={() => setEditingId(job.id)}
              onDuplicate={() => handleDuplicate(job)}
              onDelete={() => handleDelete(job)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
