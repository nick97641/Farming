import { useEffect, useRef, useState } from 'react'

import type { Project } from '../../shared/schema/project'
import { deleteProject, getProject, saveProject } from '../lib/api'

type Props = {
  projectId: string
  onBack: () => void
  onDeleted: () => void
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const AUTOSAVE_DELAY_MS = 800

export function ProjectWorkspaceView({ projectId, onBack, onDeleted }: Props) {
  const [project, setProject] = useState<Project | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipNextSave = useRef(true)

  useEffect(() => {
    skipNextSave.current = true
    setProject(null)
    setLoadError(null)
    setSaveState('idle')

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
      setSaveState('saving')
      saveProject(project)
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'))
    }, AUTOSAVE_DELAY_MS)
  }, [project])

  function updateTitle(value: string) {
    setProject((current) => (current ? { ...current, title: value } : current))
  }

  function updateTopic(value: string) {
    setProject((current) => (current ? { ...current, topic: value } : current))
  }

  function updateManualNotes(value: string) {
    setProject((current) =>
      current ? { ...current, research: { ...current.research, manualNotes: value } } : current,
    )
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
        <button onClick={onBack}>&larr; Back to projects</button>
        <span className={`save-indicator save-${saveState}`}>
          {saveState === 'idle' && 'No changes yet'}
          {saveState === 'saving' && 'Saving...'}
          {saveState === 'saved' && 'Saved'}
          {saveState === 'error' && 'Save failed'}
        </span>
      </div>

      <label className="field">
        Title
        <input value={project.title} onChange={(event) => updateTitle(event.target.value)} />
      </label>

      <label className="field">
        Topic
        <input value={project.topic} onChange={(event) => updateTopic(event.target.value)} />
      </label>

      <section className="research-workspace">
        <h2>Research workspace</h2>
        <label className="field">
          Manual notes
          <textarea
            rows={12}
            value={project.research.manualNotes}
            onChange={(event) => updateManualNotes(event.target.value)}
            placeholder="Write or paste your own research notes here..."
          />
        </label>
      </section>

      <div className="workspace-actions">
        <button onClick={handleExport}>Export project JSON</button>
        <button className="danger-button" onClick={handleDelete}>
          Delete project
        </button>
      </div>
    </div>
  )
}
