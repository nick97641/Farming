const API_BASE = '/api'

export type HealthResponse = { status: string; timestamp: string }
export type OllamaStatusResponse = { connected: true; version: string } | { connected: false; error: string }

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`)
  if (!response.ok) {
    throw new Error(`Request to ${path} failed with status ${response.status}`)
  }
  return (await response.json()) as T
}

export function getHealth(): Promise<HealthResponse> {
  return getJson('/health')
}

export function getOllamaStatus(): Promise<OllamaStatusResponse> {
  return getJson('/ollama/status')
}
