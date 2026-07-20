import { useEffect, useRef, useState } from 'react'

import type { Idea, Project } from '../../shared/schema/project'
import {
  deleteProject,
  generateIdeas as apiGenerateIdeas,
  getProject,
  organizeResearch as apiOrganizeResearch,
  saveProject,
} from '../lib/api'
import { DesignBriefTab } from './workspace/DesignBriefTab'
import { IdeasTab } from './workspace/IdeasTab'
import { OverviewTab } from './workspace/OverviewTab'
import { ResearchTab } from './workspace/ResearchTab'

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
  { id: 'content', label: 'Content', enabled: false },
  { id: 'assets', label: 'Assets', enabled: false },
  { id: 'products', label: 'Products', enabled: false },
  { id: 'export', label: 'Export', enabled: false },
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
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipNextSave = useRef(true)

  useEffect(() => {
    skipNextSave.current = true
    setProject(null)
    setLoadError(null)
    setSaveState('idle')
    setActiveTab('overview')
    setOrganizeError(null)
    setGenerateIdeasError(null)
    setPendingGeneratedIdeas([])

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
    URL.revokeObjectURL(url)
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
          <button onClick={onBack}>&larr; Back to projects</button>
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
          />
        )}
        {activeTab === 'research' && (
          <ResearchTab
            research={project.research}
            onChangeResearch={(research) => updateProject((current) => ({ ...current, research }))}
            onOrganize={handleOrganize}
            organizing={organizing}
            organizeError={organizeError}
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
            onChangeSelectedIdeaId={(selectedIdeaId) => updateProject((current) => ({ ...current, selectedIdeaId }))}
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
      </div>
    </div>
  )
}
