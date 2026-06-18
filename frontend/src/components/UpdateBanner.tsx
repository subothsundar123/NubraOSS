import { useEffect, useState } from 'react'
import './UpdateBanner.css'

interface VersionInfo {
  sha: string | null
  short: string | null
  remote_sha: string | null
  remote_short: string | null
  up_to_date: boolean
}

type UpdateState = 'idle' | 'updating' | 'done' | 'error'

export default function UpdateBanner() {
  const [info, setInfo] = useState<VersionInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [updateState, setUpdateState] = useState<UpdateState>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    fetch('/api/version')
      .then(r => r.json())
      .then((d: VersionInfo) => {
        if (!d.up_to_date && d.remote_sha) setInfo(d)
      })
      .catch(() => {})
  }, [])

  if (!info || dismissed) return null

  async function handleUpdate() {
    setUpdateState('updating')
    try {
      const r = await fetch('/api/update', { method: 'POST' })
      const d = await r.json()
      if (d.success) {
        setUpdateState('done')
        fetch('/api/restart', { method: 'POST' }).catch(() => {})
      } else {
        setUpdateState('error')
        setErrorMsg(d.error || 'Update failed')
      }
    } catch (e) {
      setUpdateState('error')
      setErrorMsg('Network error')
    }
  }

  return (
    <div className="update-banner">
      <div className="update-banner-text">
        {updateState === 'idle' && (
          <>
            <span className="update-banner-dot" />
            A new version of NubraOSS is available
            {info.remote_short && <span className="update-banner-tag">{info.remote_short}</span>}
          </>
        )}
        {updateState === 'updating' && <span>Pulling latest version...</span>}
        {updateState === 'done' && <span>Update complete — restarting backend...</span>}
        {updateState === 'error' && <span className="update-banner-error">Update failed: {errorMsg}</span>}
      </div>
      <div className="update-banner-actions">
        {updateState === 'idle' && (
          <>
            <button className="update-banner-btn primary" onClick={handleUpdate}>Update Now</button>
            <button className="update-banner-btn ghost" onClick={() => setDismissed(true)}>Dismiss</button>
          </>
        )}
        {updateState === 'done' && (
          <button className="update-banner-btn ghost" onClick={() => setDismissed(true)}>Close</button>
        )}
        {updateState === 'error' && (
          <>
            <button className="update-banner-btn primary" onClick={handleUpdate}>Retry</button>
            <button className="update-banner-btn ghost" onClick={() => setDismissed(true)}>Dismiss</button>
          </>
        )}
      </div>
    </div>
  )
}
