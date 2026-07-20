const OLLAMA_HOST = process.env.OLLAMA_HOST ?? 'http://localhost:11434'

export type OllamaStatus = { connected: true; version: string } | { connected: false; error: string }

export async function checkOllamaStatus(): Promise<OllamaStatus> {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/version`, {
      signal: AbortSignal.timeout(2000),
    })
    if (!response.ok) {
      return { connected: false, error: `Ollama responded with status ${response.status}` }
    }
    const data = (await response.json()) as { version?: string }
    return { connected: true, version: data.version ?? 'unknown' }
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error contacting Ollama',
    }
  }
}
