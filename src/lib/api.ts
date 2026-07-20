import type { Idea, Project } from '../../shared/schema/project'

const API_BASE = '/api'

export type HealthResponse = { status: string; timestamp: string }
export type OllamaStatusResponse = { connected: true; version: string } | { connected: false; error: string }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error((body as { error?: string } | null)?.error ?? `Request to ${path} failed with status ${response.status}`)
  }
  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

export function getHealth(): Promise<HealthResponse> {
  return request('/health')
}

export function getOllamaStatus(): Promise<OllamaStatusResponse> {
  return request('/ollama/status')
}

export function listProjects(): Promise<Project[]> {
  return request('/projects')
}

export function createProject(input: { title: string; topic: string }): Promise<Project> {
  return request('/projects', { method: 'POST', body: JSON.stringify(input) })
}

export function getProject(id: string): Promise<Project> {
  return request(`/projects/${id}`)
}

export function saveProject(project: Project): Promise<Project> {
  return request(`/projects/${project.id}`, { method: 'PUT', body: JSON.stringify(project) })
}

export function deleteProject(id: string): Promise<void> {
  return request(`/projects/${id}`, { method: 'DELETE' })
}

export function organizeResearch(projectId: string): Promise<Project> {
  return request(`/projects/${projectId}/research/organize`, { method: 'POST' })
}

export async function generateIdeas(projectId: string, count: number): Promise<Idea[]> {
  const result = await request<{ ideas: Idea[] }>(`/projects/${projectId}/ideas/generate`, {
    method: 'POST',
    body: JSON.stringify({ count }),
  })
  return result.ideas
}
