import { useEffect, useRef, useState } from 'react'
import './UpdateBanner.css'

interface VersionInfo {
  sha: string | null
  short: string | null
  remote_sha: string | null
  remote_short: string | null
  up_to_date: boolean
}

type UpdateState = 'idle' | 'pulling' | 'restarting' | 'back_online' | 'error'

export default function UpdateBanner() {
  const [info, setInfo]           = useState<VersionInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [state, setState]         = useState<UpdateState>('idle')
  const [elapsed, setElapsed]     = useState(0)
  const [errorMsg, setErrorMsg]   = useState('')
  const timerRef                  = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRef                   = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    fetch('/api/version')
      .then(r => r.json())
      .then((d: VersionInfo) => { if (!d.up_to_date && d.remote_sha) setInfo(d) })
      .catch(() => {})
  }, [])

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (pollRef.current)  clearInterval(pollRef.current)
  }, [])

  if (!info || dismissed) return null

  function startElapsedTimer() {
    setElapsed(0)
    timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
  }

  function stopElapsedTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  function pollUntilBack() {
    pollRef.current = setInterval(() => {
      fetch('/health', { cache: 'no-store' })
        .then(r => { if (r.ok) backOnline() })
        .catch(() => {})
    }, 2000)
  }

  function backOnline() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    stopElapsedTimer()
    setState('back_online')
    setTimeout(() => window.location.reload(), 2000)
  }

  async function handleUpdate() {
    setState('pulling')
    try {
      const r = await fetch('/api/update', { method: 'POST' })
      const d = await r.json()
      if (!d.success) {
        setState('error')
        setErrorMsg(d.error || 'Update failed')
        return
      }
    } catch {
      setState('error')
      setErrorMsg('Network error during update')
      return
    }

    // Trigger restart
    setState('restarting')
    startElapsedTimer()
    try {
      await fetch('/api/restart', { method: 'POST' })
    } catch {
      // Expected — backend may drop the connection as it restarts
    }
    // Start polling for backend to come back
    pollUntilBack()
  }

  return (
    <div className="update-banner">
      <div className="update-banner-text">
        {state === 'idle' && (
          <>
            <span className="update-banner-dot" />
            A new version of NubraOSS is available
            {info.remote_short && <span className="update-banner-tag">{info.remote_short}</span>}
          </>
        )}
        {state === 'pulling' && <span className="update-banner-spinner-row"><span className="update-banner-spinner" />Pulling latest version...</span>}
        {state === 'restarting' && (
          <span className="update-banner-spinner-row">
            <span className="update-banner-spinner" />
            Backend restarting — waiting for it to come back
            <span className="update-banner-timer">{elapsed}s</span>
          </span>
        )}
        {state === 'back_online' && <span className="update-banner-success">Backend is back online — reloading page...</span>}
        {state === 'error' && <span className="update-banner-error">Update failed: {errorMsg}</span>}
      </div>

      <div className="update-banner-actions">
        {state === 'idle' && (
          <>
            <button className="update-banner-btn primary" onClick={handleUpdate}>Update Now</button>
            <button className="update-banner-btn ghost" onClick={() => setDismissed(true)}>Dismiss</button>
          </>
        )}
        {state === 'error' && (
          <>
            <button className="update-banner-btn primary" onClick={handleUpdate}>Retry</button>
            <button className="update-banner-btn ghost" onClick={() => setDismissed(true)}>Dismiss</button>
          </>
        )}
      </div>
    </div>
  )
}
