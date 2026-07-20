import { useEffect, useState, type FormEvent } from 'react'

import type { Project } from '../../shared/schema/project'
import { createProject, deleteProject, listProjects } from '../lib/api'

type Props = {
  onOpenProject: (id: string) => void
}

export function ProjectsListView({ onOpenProject }: Props) {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [topic, setTopic] = useState('')
  const [creating, setCreating] = useState(false)

  async function refresh() {
    try {
      const list = await listProjects()
      list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      setProjects(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects')
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    if (!title.trim() || !topic.trim()) return
    setCreating(true)
    setError(null)
    try {
      const project = await createProject({ title: title.trim(), topic: topic.trim() })
      setTitle('')
      setTopic('')
      await refresh()
      onOpenProject(project.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id: string, projectTitle: string) {
    if (!window.confirm(`Delete "${projectTitle}"? This cannot be undone.`)) return
    try {
      await deleteProject(id)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project')
    }
  }

  return (
    <div>
      <form className="new-project-form" onSubmit={handleCreate}>
        <h2>New project</h2>
        <label className="field">
          Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. DWC Lettuce Setup" />
        </label>
        <label className="field">
          Topic
          <input
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="e.g. deep water culture lettuce"
          />
        </label>
        <button type="submit" disabled={creating || !title.trim() || !topic.trim()}>
          {creating ? 'Creating...' : 'Create project'}
        </button>
      </form>

      {error && <p className="error-text">{error}</p>}

      <h2>Projects</h2>
      {projects === null && <p>Loading...</p>}
      {projects && projects.length === 0 && <p>No projects yet — create one above.</p>}
      {projects && projects.length > 0 && (
        <ul className="project-list">
          {projects.map((project) => (
            <li key={project.id} className="project-list-item">
              <button className="project-open-button" onClick={() => onOpenProject(project.id)}>
                <span className="project-title">{project.title}</span>
                <span className="project-topic">{project.topic}</span>
              </button>
              <button className="project-delete-button" onClick={() => handleDelete(project.id, project.title)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
