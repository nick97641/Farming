import { useState } from 'react'

import {
  createDefaultAdvancedSettings,
  type DesignBrief,
  type ImageJob,
  type ImageReferenceInfluence,
  type ImageReferenceRole,
} from '../../../shared/schema/project'
import { createDefaultStructuredRequirements, ENRICHMENT_POLICY_VERSION } from '../../../shared/imageEnrichment'
import { DEFAULT_MODEL_PROFILE_ID } from '../../../shared/modelProfiles'
import { duplicateImageJob } from '../../lib/imageJobOptions'
import { ImageJobCard } from './ImageJobCard'
import { ImageJobEditor } from './ImageJobEditor'

type Props = {
  projectId: string
  projectTitle: string
  projectTopic: string
  imageJobs: ImageJob[]
  designBrief: DesignBrief | null
  onChangeImageJobs: (jobs: ImageJob[]) => void
  onImport: (jobId: string, file: File) => void
  importingJobId: string | null
  importError: string | null
  onDeleteJob: (jobId: string, label: string) => void
  onGenerateVariations: (jobId: string, count: number) => void
  generatingJobId: string | null
  generateProgressLabel: string | null
  generateError: string | null
  onCancelGenerate: () => void
  canCancelGenerate: boolean
  onImportReference: (jobId: string, file: File, role: ImageReferenceRole, influence: ImageReferenceInfluence) => void
  onRemoveReference: (jobId: string, referenceId: string) => void
  referenceImportingJobId: string | null
  referenceImportError: string | null
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
    policyVersion: ENRICHMENT_POLICY_VERSION,
    userDescription: designBrief?.visualDirection ?? '',
    structuredRequirements: createDefaultStructuredRequirements(),
    enrichmentRecipe: null,
    destination: null,
    references: [],
    modelProfileId: DEFAULT_MODEL_PROFILE_ID,
    advancedSettings: createDefaultAdvancedSettings(),
    controls: [],
    effectiveModel: null,
    variationGroupId: null,
    createdAt: now,
    updatedAt: now,
  }
}

export function ImageGenerationTab({
  projectId,
  projectTitle,
  projectTopic,
  imageJobs,
  designBrief,
  onChangeImageJobs,
  onImport,
  importingJobId,
  importError,
  onDeleteJob,
  onGenerateVariations,
  generatingJobId,
  generateProgressLabel,
  generateError,
  onCancelGenerate,
  canCancelGenerate,
  onImportReference,
  onRemoveReference,
  referenceImportingJobId,
  referenceImportError,
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
        projectTitle={projectTitle}
        projectTopic={projectTopic}
        job={editingJob}
        designBrief={designBrief}
        onChange={handleUpdate}
        onClose={() => setEditingId(null)}
        onDelete={() => handleDelete(editingJob)}
        onImport={(file) => onImport(editingJob.id, file)}
        importing={importingJobId === editingJob.id}
        importError={importError}
        onGenerate={(count) => onGenerateVariations(editingJob.id, count)}
        generating={generatingJobId === editingJob.id}
        generateProgressLabel={generatingJobId === editingJob.id ? generateProgressLabel : null}
        generateError={generateError}
        onCancelGenerate={onCancelGenerate}
        canCancelGenerate={canCancelGenerate && generatingJobId === editingJob.id}
        onImportReference={(file, role, influence) => onImportReference(editingJob.id, file, role, influence)}
        onRemoveReference={(referenceId) => onRemoveReference(editingJob.id, referenceId)}
        referenceImporting={referenceImportingJobId === editingJob.id}
        referenceImportError={referenceImportError}
        onDuplicate={handleDuplicate}
      />
    )
  }

  // Jobs generated together via "number of images" share a variationGroupId
  // and are shown grouped; everything else (manual creates, plain
  // duplicates, imports) shows as its own entry, same as before.
  const seenGroups = new Set<string>()

  return (
    <div className="image-jobs-tab">
      <p className="tab-explanation">
        Describe the image, choose where it will be used, and generate with the local Draw Things app — no model
        jargon required. Advanced settings are available per job if you need them.
      </p>

      <button type="button" onClick={handleCreate}>
        Create image job
      </button>

      {imageJobs.length === 0 && <p className="empty-hint">No image jobs yet — create one above.</p>}

      {imageJobs.length > 0 && (
        <ul className="idea-list">
          {imageJobs.map((job) => {
            const isGrouped = job.variationGroupId !== null
            const groupSiblings = isGrouped ? imageJobs.filter((j) => j.variationGroupId === job.variationGroupId) : [job]
            if (isGrouped) {
              if (seenGroups.has(job.variationGroupId as string)) return null
              seenGroups.add(job.variationGroupId as string)
            }
            return (
              <li key={job.variationGroupId ?? job.id} className="variation-group">
                {isGrouped && groupSiblings.length > 1 && (
                  <p className="field-hint">Variations ({groupSiblings.length})</p>
                )}
                <ul className="idea-list">
                  {groupSiblings.map((sibling) => (
                    <ImageJobCard
                      key={sibling.id}
                      projectId={projectId}
                      job={sibling}
                      designBrief={designBrief}
                      onEdit={() => setEditingId(sibling.id)}
                      onDuplicate={() => handleDuplicate(sibling)}
                      onDelete={() => handleDelete(sibling)}
                    />
                  ))}
                </ul>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
