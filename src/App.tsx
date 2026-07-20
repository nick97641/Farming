import { useEffect, useState } from 'react'

import { getHealth, getOllamaStatus, type OllamaStatusResponse } from './lib/api'

type BackendState = 'checking' | 'online' | 'offline'

function App() {
  const [backendState, setBackendState] = useState<BackendState>('checking')
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatusResponse | null>(null)

  useEffect(() => {
    getHealth()
      .then(() => setBackendState('online'))
      .catch(() => setBackendState('offline'))

    getOllamaStatus()
      .then(setOllamaStatus)
      .catch(() => setOllamaStatus({ connected: false, error: 'Could not reach the Ollama status endpoint' }))
  }, [])

  const ollamaState: BackendState = !ollamaStatus ? 'checking' : ollamaStatus.connected ? 'online' : 'offline'

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Farming</h1>
        <p className="app-subtitle">Local-first content production for gardening &amp; hydroponics</p>
      </header>

      <section className="status-panel">
        <div className={`status-row status-${backendState}`}>
          <span className="status-label">Backend</span>
          <span className="status-value">
            {backendState === 'checking' && 'Checking...'}
            {backendState === 'online' && 'Connected'}
            {backendState === 'offline' && 'Not reachable'}
          </span>
        </div>

        <div className={`status-row status-${ollamaState}`}>
          <span className="status-label">Ollama</span>
          <span className="status-value">
            {ollamaState === 'checking' && 'Checking...'}
            {ollamaStatus?.connected && `Connected (v${ollamaStatus.version})`}
            {ollamaStatus && !ollamaStatus.connected && `Not reachable — ${ollamaStatus.error}`}
          </span>
        </div>
      </section>

      <main className="app-placeholder">
        <p>Projects will appear here starting in Phase 1.</p>
      </main>
    </div>
  )
}

export default App
