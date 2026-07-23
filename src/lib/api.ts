import type { Idea, Project } from '../../shared/schema/project'

const API_BASE = '/api'

export type HealthResponse = { status: string; timestamp: string }
export type OllamaStatusResponse = { connected: true; version: string } | { connected: false; error: string }
export type ContentGenerationTarget = 'youtube-script' | 'pdf-draft'

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

export function getImageJobFileUrl(projectId: string, jobId: string): string {
  return `${API_BASE}/projects/${projectId}/image-jobs/${jobId}/file`
}

// Raw-body upload, not routed through request() — the body is the file's own
// bytes with its own Content-Type, not JSON.
export async function importImageJobFile(projectId: string, jobId: string, file: File): Promise<Project> {
  const url = `${API_BASE}/projects/${projectId}/image-jobs/${jobId}/import?filename=${encodeURIComponent(file.name)}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error((body as { error?: string } | null)?.error ?? `Import failed with status ${response.status}`)
  }
  return (await response.json()) as Project
}

export function deleteImageJob(projectId: string, jobId: string): Promise<Project> {
  return request(`/projects/${projectId}/image-jobs/${jobId}`, { method: 'DELETE' })
}

export function generateImageJob(projectId: string, jobId: string): Promise<Project> {
  return request(`/projects/${projectId}/image-jobs/${jobId}/generate`, { method: 'POST' })
}

export function getReferenceFileUrl(projectId: string, jobId: string, referenceId: string): string {
  return `${API_BASE}/projects/${projectId}/image-jobs/${jobId}/references/${referenceId}/file`
}

export async function importReferencePhoto(
  projectId: string,
  jobId: string,
  file: File,
  role: string,
  influence: string,
): Promise<Project> {
  const url =
    `${API_BASE}/projects/${projectId}/image-jobs/${jobId}/references/import` +
    `?role=${encodeURIComponent(role)}&influence=${encodeURIComponent(influence)}&filename=${encodeURIComponent(file.name)}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error((body as { error?: string } | null)?.error ?? `Reference import failed with status ${response.status}`)
  }
  return (await response.json()) as Project
}

export function deleteReferencePhoto(projectId: string, jobId: string, referenceId: string): Promise<Project> {
  return request(`/projects/${projectId}/image-jobs/${jobId}/references/${referenceId}`, { method: 'DELETE' })
}

export async function generateContent(projectId: string, target: ContentGenerationTarget): Promise<string> {
  const result = await request<{ text: string }>(`/projects/${projectId}/content/generate`, {
    method: 'POST',
    body: JSON.stringify({ target }),
  })
  return result.text
}

export function getContentPdfUrl(projectId: string): string {
  return `${API_BASE}/projects/${projectId}/content/pdf`
}

export async function renderVideo(
  projectId: string,
  imageJobIds: string[],
  narration: File,
): Promise<{ project: Project; videoAssetId: string }> {
  const url =
    `${API_BASE}/projects/${projectId}/video/render` +
    `?imageJobIds=${encodeURIComponent(imageJobIds.join(','))}&filename=${encodeURIComponent(narration.name)}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': narration.type || 'application/octet-stream' },
    body: narration,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error((body as { error?: string } | null)?.error ?? `Video render failed with status ${response.status}`)
  }
  return (await response.json()) as { project: Project; videoAssetId: string }
}

export function getAssetFileUrl(projectId: string, assetId: string): string {
  return `${API_BASE}/projects/${projectId}/assets/${assetId}/file`
}
