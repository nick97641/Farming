import { useEffect, useRef, useState } from 'react'

import type { Idea, ImageReferenceInfluence, ImageReferenceRole, Project } from '../../shared/schema/project'
import {
  deleteImageJob as apiDeleteImageJob,
  deleteProject,
  deleteReferencePhoto as apiDeleteReferencePhoto,
  getResearchJob as apiGetResearchJob,
  generateContent as apiGenerateContent,
  generateImageJob as apiGenerateImageJob,
  generateIdeas as apiGenerateIdeas,
  getContentPdfUrl,
  getProject,
  importImageJobFile as apiImportImageJobFile,
  importReferencePhoto as apiImportReferencePhoto,
  organizeResearch as apiOrganizeResearch,
  renderVideo as apiRenderVideo,
  saveProject,
  startResearchJob as apiStartResearchJob,
  type ContentGenerationTarget,
  type OpportunityScoutConfig,
  type ResearchJob,
} from '../lib/api'
import { duplicateImageJob } from '../lib/imageJobOptions'
import { ContentTab } from './workspace/ContentTab'
import { createBriefFromIdea } from '../lib/designBriefOptions'
import { DesignBriefTab } from './workspace/DesignBriefTab'
import { ExportTab } from './workspace/ExportTab'
import { IdeasTab } from './workspace/IdeasTab'
import { ImageGenerationTab } from './workspace/ImageGenerationTab'
import { OverviewTab } from './workspace/OverviewTab'
import { ProductsTab } from './workspace/ProductsTab'
import { ResearchTab } from './workspace/ResearchTab'
import { VideoTab } from './workspace/VideoTab'
import { AssetsTab } from './workspace/AssetsTab'

type Props = {
  projectId: string
  onBack: () => void
  onDeleted: () => void
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const AUTOSAVE_DELAY_MS = 800

const TABS = [
  { id: 'overview', label: 'Overview', enabled: true },
  { id: 'research', label: 'Research', enabled: true },
  { id: 'ideas', label: 'Ideas', enabled: true },
  { id: 'brief', label: 'Design Brief', enabled: true },
  { id: 'images', label: 'Image Generation', enabled: true },
  { id: 'content', label: 'Content', enabled: true },
  { id: 'video', label: 'Video', enabled: true },
  { id: 'assets', label: 'Assets', enabled: true },
  { id: 'products', label: 'Products', enabled: true },
  { id: 'export', label: 'Export', enabled: true },
] as const

type TabId = (typeof TABS)[number]['id']

export function ProjectWorkspaceView({ projectId, onBack, onDeleted }: Props) {
  const [project, setProject] = useState<Project | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [organizing, setOrganizing] = useState(false)
  const [organizeError, setOrganizeError] = useState<string | null>(null)
  const [generatingIdeas, setGeneratingIdeas] = useState(false)
  const [generateIdeasError, setGenerateIdeasError] = useState<string | null>(null)
  const [pendingGeneratedIdeas, setPendingGeneratedIdeas] = useState<Idea[]>([])
  const [importingImageJobId, setImportingImageJobId] = useState<string | null>(null)
  const [importImageError, setImportImageError] = useState<string | null>(null)
  const [generatingImageJobId, setGeneratingImageJobId] = useState<string | null>(null)
  const [generateImageError, setGenerateImageError] = useState<string | null>(null)
  const [generateProgressLabel, setGenerateProgressLabel] = useState<string | null>(null)
  const [canCancelGenerate, setCanCancelGenerate] = useState(false)
  const [referenceImportingJobId, setReferenceImportingJobId] = useState<string | null>(null)
  const [referenceImportError, setReferenceImportError] = useState<string | null>(null)
  const [generatingContentTarget, setGeneratingContentTarget] = useState<ContentGenerationTarget | null>(null)
  const [generateContentError, setGenerateContentError] = useState<string | null>(null)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [exportPdfError, setExportPdfError] = useState<string | null>(null)
  const [renderingVideo, setRenderingVideo] = useState(false)
  const [renderVideoError, setRenderVideoError] = useState<string | null>(null)
  const [findingOpportunities, setFindingOpportunities] = useState(false)
  const [findOpportunitiesError, setFindOpportunitiesError] = useState<string | null>(null)
  const [pendingOpportunities, setPendingOpportunities] = useState<Idea[]>([])
  const [opportunityPhrasesWithNoResults, setOpportunityPhrasesWithNoResults] = useState<string[]>([])
  const [opportunityPhraseErrors, setOpportunityPhraseErrors] = useState<{ phrase: string; error: string }[]>([])
  const [researchJob, setResearchJob] = useState<ResearchJob | null>(null)
  const [leaving, setLeaving] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipNextSave = useRef(true)
  const cancelGenerateRef = useRef(false)

  useEffect(() => {
    skipNextSave.current = true
    setProject(null)
    setLoadError(null)
    setSaveState('idle')
    setActiveTab('overview')
    setOrganizeError(null)
    setGenerateIdeasError(null)
    setPendingGeneratedIdeas([])
    setImportImageError(null)
    setGenerateImageError(null)
    setReferenceImportError(null)
    setGenerateContentError(null)
    setExportPdfError(null)
    setRenderVideoError(null)
    setFindOpportunitiesError(null)
    setPendingOpportunities([])
    setOpportunityPhrasesWithNoResults([])
    setOpportunityPhraseErrors([])
    setResearchJob(null)
    setLeaving(false)

    getProject(projectId)
      .then(setProject)
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load project'))

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [projectId])

  useEffect(() => {
    if (!project) return
    if (skipNextSave.current) {
      skipNextSave.current = false
      return
    }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      runSave(project)
    }, AUTOSAVE_DELAY_MS)
  }, [project])

  async function runSave(toSave: Project) {
    setSaveState('saving')
    try {
      await saveProject(toSave)
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }

  function handleRetrySave() {
    if (!project) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    runSave(project)
  }

  function updateProject(updater: (current: Project) => Project) {
    setProject((current) => (current ? updater(current) : current))
  }

  async function handleBack() {
    if (!project || leaving) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setLeaving(true)
    setSaveState('saving')
    try {
      await saveProject(project)
      setSaveState('saved')
      onBack()
    } catch {
      setSaveState('error')
      setLeaving(false)
    }
  }

  async function handleDelete() {
    if (!project) return
    if (!window.confirm(`Delete "${project.title}"? This cannot be undone.`)) return
    await deleteProject(project.id)
    onDeleted()
  }

  function handleExport() {
    if (!project) return
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${project.id}.json`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  async function handleOrganize() {
    if (!project) return
    setOrganizing(true)
    setOrganizeError(null)
    try {
      // Flush any pending edit before asking the AI to organize, so it works
      // from the latest text rather than a stale on-disk copy.
      if (saveTimer.current) clearTimeout(saveTimer.current)
      await saveProject(project)
      setSaveState('saved')

      const updated = await apiOrganizeResearch(project.id)
      skipNextSave.current = true
      setProject(updated)
    } catch (err) {
      setOrganizeError(err instanceof Error ? err.message : 'Failed to organize research with AI')
    } finally {
      setOrganizing(false)
    }
  }

  async function handleGenerateIdeas(count: number) {
    if (!project) return
    setGeneratingIdeas(true)
    setGenerateIdeasError(null)
    try {
      // Same reasoning as handleOrganize: generation reads research from the
      // persisted file server-side, so flush pending edits first.
      if (saveTimer.current) clearTimeout(saveTimer.current)
      await saveProject(project)
      setSaveState('saved')

      const drafts = await apiGenerateIdeas(project.id, count)
      setPendingGeneratedIdeas(drafts)
    } catch (err) {
      setGenerateIdeasError(err instanceof Error ? err.message : 'Failed to generate ideas with AI')
    } finally {
      setGeneratingIdeas(false)
    }
  }

  async function handleGenerateContent(target: ContentGenerationTarget) {
    if (!project) return
    setGeneratingContentTarget(target)
    setGenerateContentError(null)
    try {
      // Same reasoning as handleGenerateIdeas: generation reads the Design
      // Brief from the persisted file server-side, so flush pending edits first.
      if (saveTimer.current) clearTimeout(saveTimer.current)
      await saveProject(project)
      setSaveState('saved')

      const text = await apiGenerateContent(project.id, target)
      updateProject((current) => ({
        ...current,
        content:
          target === 'youtube-script'
            ? { ...current.content, longFormScript: text }
            : { ...current.content, pdfDraft: text },
      }))
    } catch (err) {
      setGenerateContentError(err instanceof Error ? err.message : 'Failed to generate content with AI')
    } finally {
      setGeneratingContentTarget(null)
    }
  }

  async function handleExportPdf() {
    if (!project) return
    setExportingPdf(true)
    setExportPdfError(null)
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      await saveProject(project)
      setSaveState('saved')

      const link = document.createElement('a')
      link.href = getContentPdfUrl(project.id)
      document.body.append(link)
      link.click()
      link.remove()
    } catch (err) {
      setExportPdfError(err instanceof Error ? err.message : 'Failed to export PDF')
    } finally {
      setExportingPdf(false)
    }
  }

  async function handleRenderVideo(imageJobIds: string[], narration: File) {
    if (!project) return
    setRenderingVideo(true)
    setRenderVideoError(null)
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      await saveProject(project)
      setSaveState('saved')

      const result = await apiRenderVideo(project.id, imageJobIds, narration)
      skipNextSave.current = true
      setProject(result.project)
    } catch (err) {
      setRenderVideoError(err instanceof Error ? err.message : 'Failed to render the video')
    } finally {
      setRenderingVideo(false)
    }
  }

  async function handleFindOpportunities(config: OpportunityScoutConfig, mode: 'topic' | 'discover' = 'topic') {
    if (!project) return
    setFindingOpportunities(true)
    setFindOpportunitiesError(null)
    try {
      // Same reasoning as handleGenerateIdeas/handleGenerateContent: the
      // route reads the project server-side, so flush pending edits first.
      if (saveTimer.current) clearTimeout(saveTimer.current)
      await saveProject(project)
      setSaveState('saved')

      let job = await apiStartResearchJob(project.id, { topic: config.seedTopic, mode })
      setResearchJob(job)
      while (job.state === 'queued' || job.state === 'running') {
        await new Promise((resolve) => window.setTimeout(resolve, 750))
        job = await apiGetResearchJob(project.id, job.id)
        setResearchJob(job)
      }
      if (job.state === 'failed') throw new Error(job.error ?? 'Automatic research failed')
      if (job.result) {
        skipNextSave.current = true
        setProject(job.result.project)
      }
      setPendingOpportunities([])
      setOpportunityPhrasesWithNoResults([])
      setOpportunityPhraseErrors([])
    } catch (err) {
      setFindOpportunitiesError(err instanceof Error ? err.message : 'Failed to find opportunities')
    } finally {
      setFindingOpportunities(false)
    }
  }

  // Accepting/discarding a scout draft never calls the server directly —
  // exactly like accepting/discarding an AI-generated idea draft, it only
  // ever mutates local state, and the normal autosave effect persists the
  // result. Nothing here is added to project.ideas until the user acts.
  function handleAcceptOpportunity(idea: Idea) {
    updateProject((current) => ({ ...current, ideas: [...current.ideas, idea] }))
    setPendingOpportunities((current) => current.filter((item) => item.id !== idea.id))
  }

  function handleAcceptAllOpportunities() {
    updateProject((current) => ({ ...current, ideas: [...current.ideas, ...pendingOpportunities] }))
    setPendingOpportunities([])
  }

  function handleDiscardOpportunity(ideaId: string) {
    setPendingOpportunities((current) => current.filter((item) => item.id !== ideaId))
  }

  function handleDiscardAllOpportunities() {
    setPendingOpportunities([])
    setOpportunityPhrasesWithNoResults([])
    setOpportunityPhraseErrors([])
  }

  async function handleImportImageJobFile(jobId: string, file: File) {
    if (!project) return
    setImportingImageJobId(jobId)
    setImportImageError(null)
    try {
      // Same reasoning as handleOrganize/handleGenerateIdeas: the import
      // route reads the job from the persisted project server-side, so a
      // job must already be saved (and any pending edits flushed) before it
      // can be targeted.
      if (saveTimer.current) clearTimeout(saveTimer.current)
      await saveProject(project)
      setSaveState('saved')

      const updated = await apiImportImageJobFile(project.id, jobId, file)
      skipNextSave.current = true
      setProject(updated)
    } catch (err) {
      setImportImageError(err instanceof Error ? err.message : 'Failed to import image')
    } finally {
      setImportingImageJobId(null)
    }
  }

  async function handleDeleteImageJob(jobId: string, label: string) {
    if (!project) return
    if (!window.confirm(`Delete "${label || 'this image job'}"? This cannot be undone.`)) return
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      await saveProject(project)
      setSaveState('saved')

      const updated = await apiDeleteImageJob(project.id, jobId)
      skipNextSave.current = true
      setProject(updated)
    } catch (err) {
      setImportImageError(err instanceof Error ? err.message : 'Failed to delete image job')
    }
  }

  // "Number of images" generates through this same foreground request flow,
  // one at a time, sequentially — never a batch endpoint or background
  // worker. The original job is generated first; each additional variation
  // is a fresh duplicate (its own id, its own seed, no output yet) that is
  // saved before being generated, so nothing is ever overwritten and every
  // variation is independently addressable. All siblings created by one
  // request share a variationGroupId purely for display grouping.
  async function handleGenerateVariations(jobId: string, count: number) {
    if (!project) return
    setGeneratingImageJobId(jobId)
    setGenerateImageError(null)
    setGenerateProgressLabel(count > 1 ? `Generating image 1 of ${count}` : null)
    setCanCancelGenerate(count > 1)
    cancelGenerateRef.current = false

    try {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      let currentProject = await saveProject(project)
      skipNextSave.current = true
      setProject(currentProject)

      const originalJob = currentProject.imageJobs.find((job) => job.id === jobId)
      if (!originalJob) return

      const groupId = count > 1 ? crypto.randomUUID() : originalJob.variationGroupId
      if (groupId !== originalJob.variationGroupId) {
        currentProject = await saveProject({
          ...currentProject,
          imageJobs: currentProject.imageJobs.map((job) => (job.id === jobId ? { ...job, variationGroupId: groupId } : job)),
        })
        skipNextSave.current = true
        setProject(currentProject)
      }

      for (let index = 0; index < count; index += 1) {
        if (cancelGenerateRef.current) break
        setGenerateProgressLabel(`Generating image ${index + 1} of ${count}`)

        let targetJobId = jobId
        if (index > 0) {
          const source = currentProject.imageJobs.find((job) => job.id === jobId)
          if (!source) break
          const duplicate = duplicateImageJob(source, { variationGroupId: groupId })
          currentProject = await saveProject({ ...currentProject, imageJobs: [...currentProject.imageJobs, duplicate] })
          skipNextSave.current = true
          setProject(currentProject)
          targetJobId = duplicate.id
        }

        setGeneratingImageJobId(targetJobId)
        currentProject = await apiGenerateImageJob(currentProject.id, targetJobId)
        skipNextSave.current = true
        setProject((current) => {
          if (!current) return currentProject
          const generatedJob = currentProject.imageJobs.find((candidate) => candidate.id === targetJobId)
          if (!generatedJob) return current
          const currentIds = new Set(current.imageJobs.map((candidate) => candidate.id))
          return {
            ...current,
            updatedAt: currentProject.updatedAt,
            imageJobs: [
              ...current.imageJobs.map((candidate) => (candidate.id === targetJobId ? generatedJob : candidate)),
              ...currentProject.imageJobs.filter((candidate) => !currentIds.has(candidate.id)),
            ],
          }
        })
      }
    } catch (err) {
      setGenerateImageError(err instanceof Error ? err.message : 'Failed to generate image with Draw Things')
    } finally {
      setGeneratingImageJobId(null)
      setGenerateProgressLabel(null)
      setCanCancelGenerate(false)
    }
  }

  async function handleGenerateApprovalSet(jobIds: string[]) {
    if (!project || jobIds.length === 0) return
    setGenerateImageError(null)
    setCanCancelGenerate(true)
    cancelGenerateRef.current = false
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      let currentProject = await saveProject(project)
      skipNextSave.current = true
      setProject(currentProject)
      for (let index = 0; index < jobIds.length; index += 1) {
        if (cancelGenerateRef.current) break
        const jobId = jobIds[index]
        setGeneratingImageJobId(jobId)
        setGenerateProgressLabel(`Generating approval image ${index + 1} of ${jobIds.length}`)
        currentProject = await apiGenerateImageJob(currentProject.id, jobId)
        skipNextSave.current = true
        setProject(currentProject)
      }
    } catch (err) {
      setGenerateImageError(err instanceof Error ? err.message : 'Failed to generate the approval image set')
    } finally {
      setGeneratingImageJobId(null)
      setGenerateProgressLabel(null)
      setCanCancelGenerate(false)
    }
  }

  function handleCancelGenerate() {
    cancelGenerateRef.current = true
  }

  async function handleImportReference(jobId: string, file: File, role: ImageReferenceRole, influence: ImageReferenceInfluence) {
    if (!project) return
    setReferenceImportingJobId(jobId)
    setReferenceImportError(null)
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      await saveProject(project)
      setSaveState('saved')

      const updated = await apiImportReferencePhoto(project.id, jobId, file, role, influence)
      skipNextSave.current = true
      setProject(updated)
    } catch (err) {
      setReferenceImportError(err instanceof Error ? err.message : 'Failed to add reference photo')
    } finally {
      setReferenceImportingJobId(null)
    }
  }

  async function handleRemoveReference(jobId: string, referenceId: string) {
    if (!project) return
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      await saveProject(project)
      setSaveState('saved')

      const updated = await apiDeleteReferencePhoto(project.id, jobId, referenceId)
      skipNextSave.current = true
      setProject(updated)
    } catch (err) {
      setReferenceImportError(err instanceof Error ? err.message : 'Failed to remove reference photo')
    }
  }

  if (loadError) {
    return (
      <div>
        <p className="error-text">{loadError}</p>
        <button onClick={onBack}>Back to projects</button>
      </div>
    )
  }

  if (!project) {
    return <p>Loading...</p>
  }

  return (
    <div className="workspace">
      <div className="workspace-toolbar">
        <div className="toolbar-left">
          <button onClick={handleBack} disabled={leaving}>
            {leaving ? 'Saving...' : '← Back to projects'}
          </button>
        </div>
        <div className="toolbar-right">
          <span className={`save-indicator save-${saveState}`}>
            {saveState === 'idle' && 'No changes yet'}
            {saveState === 'saving' && 'Saving...'}
            {saveState === 'saved' && 'Saved'}
            {saveState === 'error' && 'Save failed'}
          </span>
          {saveState === 'error' && <button onClick={handleRetrySave}>Retry save</button>}
          <button onClick={handleExport}>Export project JSON</button>
          <button className="danger-button" onClick={handleDelete}>
            Delete project
          </button>
        </div>
      </div>

      <div className="tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab-button ${activeTab === tab.id ? 'tab-active' : ''}`}
            disabled={!tab.enabled}
            title={tab.enabled ? undefined : 'Coming in a future phase'}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="tab-content">
        {activeTab === 'overview' && (
          <OverviewTab
            title={project.title}
            topic={project.topic}
            onChangeTitle={(title) => updateProject((current) => ({ ...current, title }))}
            onChangeTopic={(topic) => updateProject((current) => ({ ...current, topic }))}
            projectId={project.id}
            ideas={project.ideas}
            selectedIdeaId={project.selectedIdeaId}
            designBrief={project.designBrief}
            youtubeScript={project.content.longFormScript}
            pdfDraft={project.content.pdfDraft}
            imageJobs={project.imageJobs}
            selectedImageJobId={project.selectedImageJobId}
            onNavigate={(tab) => setActiveTab(tab)}
          />
        )}
        {activeTab === 'research' && (
          <ResearchTab
            projectTopic={project.topic}
            research={project.research}
            onChangeResearch={(research) => updateProject((current) => ({ ...current, research }))}
            onOrganize={handleOrganize}
            organizing={organizing}
            organizeError={organizeError}
            onFindOpportunities={handleFindOpportunities}
            findingOpportunities={findingOpportunities}
            findOpportunitiesError={findOpportunitiesError}
            researchJob={researchJob}
            pendingOpportunities={pendingOpportunities}
            opportunityPhrasesWithNoResults={opportunityPhrasesWithNoResults}
            opportunityPhraseErrors={opportunityPhraseErrors}
            onAcceptOpportunity={handleAcceptOpportunity}
            onAcceptAllOpportunities={handleAcceptAllOpportunities}
            onDiscardOpportunity={handleDiscardOpportunity}
            onDiscardAllOpportunities={handleDiscardAllOpportunities}
          />
        )}
        {activeTab === 'ideas' && (
          <IdeasTab
            ideas={project.ideas}
            research={project.research}
            onChangeIdeas={(ideas) => updateProject((current) => ({ ...current, ideas }))}
            pendingGeneratedIdeas={pendingGeneratedIdeas}
            onChangePendingGeneratedIdeas={setPendingGeneratedIdeas}
            onGenerate={handleGenerateIdeas}
            generating={generatingIdeas}
            generateError={generateIdeasError}
            selectedIdeaId={project.selectedIdeaId}
            onChangeSelectedIdeaId={(selectedIdeaId) =>
              updateProject((current) => {
                const selected = selectedIdeaId ? current.ideas.find((idea) => idea.id === selectedIdeaId) : null
                return {
                  ...current,
                  selectedIdeaId,
                  designBrief: selected && !current.designBrief ? createBriefFromIdea(selected) : current.designBrief,
                }
              })
            }
          />
        )}
        {activeTab === 'brief' && (
          <DesignBriefTab
            ideas={project.ideas}
            selectedIdeaId={project.selectedIdeaId}
            designBrief={project.designBrief}
            onChangeDesignBrief={(designBrief) => updateProject((current) => ({ ...current, designBrief }))}
          />
        )}
        {activeTab === 'images' && (
          <ImageGenerationTab
            projectId={project.id}
            projectTitle={project.title}
            projectTopic={project.topic}
            imageJobs={project.imageJobs}
            designBrief={project.designBrief}
            onChangeImageJobs={(imageJobs) => updateProject((current) => ({ ...current, imageJobs }))}
            onImport={handleImportImageJobFile}
            importingJobId={importingImageJobId}
            importError={importImageError}
            onDeleteJob={handleDeleteImageJob}
            onGenerateVariations={handleGenerateVariations}
            onGenerateApprovalSet={handleGenerateApprovalSet}
            generatingJobId={generatingImageJobId}
            generateProgressLabel={generateProgressLabel}
            generateError={generateImageError}
            onCancelGenerate={handleCancelGenerate}
            canCancelGenerate={canCancelGenerate}
            onImportReference={handleImportReference}
            onRemoveReference={handleRemoveReference}
            referenceImportingJobId={referenceImportingJobId}
            referenceImportError={referenceImportError}
            selectedImageJobId={project.selectedImageJobId}
            onChangeSelectedImageJobId={(selectedImageJobId) =>
              updateProject((current) => ({ ...current, selectedImageJobId }))
            }
          />
        )}
        {activeTab === 'content' && (
          <ContentTab
            designBrief={project.designBrief}
            content={project.content}
            onChangeContent={(content) => updateProject((current) => ({ ...current, content }))}
            onGenerate={handleGenerateContent}
            onExportPdf={handleExportPdf}
            generatingTarget={generatingContentTarget}
            generateError={generateContentError}
            exportingPdf={exportingPdf}
            exportPdfError={exportPdfError}
          />
        )}
        {activeTab === 'video' && (
          <VideoTab
            projectId={project.id}
            script={project.content.longFormScript}
            imageJobs={project.imageJobs}
            assets={project.assets}
            rendering={renderingVideo}
            renderError={renderVideoError}
            onRender={handleRenderVideo}
          />
        )}
        {activeTab === 'assets' && (
          <AssetsTab projectId={project.id} imageJobs={project.imageJobs} assets={project.assets} />
        )}
        {activeTab === 'products' && (
          <ProductsTab
            project={project}
            products={project.products}
            selectedIdea={project.ideas.find((idea) => idea.id === project.selectedIdeaId) ?? null}
            onChangeProducts={(products) => updateProject((current) => ({ ...current, products }))}
            onExportPdf={handleExportPdf}
          />
        )}
        {activeTab === 'export' && (
          <ExportTab project={project} onExportProjectJson={handleExport} onExportPdf={handleExportPdf} />
        )}
      </div>
    </div>
  )
}
