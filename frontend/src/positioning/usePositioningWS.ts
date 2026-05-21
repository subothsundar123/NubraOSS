import { useEffect, useRef, useState } from 'react'
import { normalizePositioningSnapshot } from './defaults'
import type { PositioningConnectionState, PositioningInit, PositioningSnapshot } from './types'

const SNAPSHOT_CACHE_KEY = 'positioning.snapshot.v1'
const SNAPSHOT_MAX_AGE_MS = 30 * 60 * 1000 // 30 minutes

function wsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${window.location.host}/ws/positioning`
}

function loadCachedSnapshot(): PositioningSnapshot | null {
  try {
    const raw = sessionStorage.getItem(SNAPSHOT_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { ts: number; data: unknown }
    if (Date.now() - parsed.ts > SNAPSHOT_MAX_AGE_MS) {
      sessionStorage.removeItem(SNAPSHOT_CACHE_KEY)
      return null
    }
    return normalizePositioningSnapshot(parsed.data)
  } catch {
    return null
  }
}

function saveCachedSnapshot(snapshot: PositioningSnapshot): void {
  try {
    sessionStorage.setItem(SNAPSHOT_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: snapshot }))
  } catch {}
}

export function usePositioningWS(init: PositioningInit) {
  const [snapshot, setSnapshot] = useState<PositioningSnapshot | null>(loadCachedSnapshot)
  const [state, setState] = useState<PositioningConnectionState>(() => ({
    connected: false,
    connecting: init.enabled,  // signal "reconnecting" immediately if enabled
    error: '',
    lastMessageAt: null,
  }))
  const reconnectRef = useRef<number | null>(null)
  const socketRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!init.enabled) return
    let cancelled = false

    function connect() {
      if (cancelled) return
      setState((current) => ({ ...current, connecting: true, error: '' }))
      const socket = new WebSocket(wsUrl())
      socketRef.current = socket

      socket.onopen = () => {
        socket.send(JSON.stringify({
          session_token: init.sessionToken,
          device_id: init.deviceId,
          environment: init.environment,
          channels: ['market_state', 'breadth', 'sectors', 'opportunities', 'options', 'commentary', 'alerts'],
        }))
        setState((current) => ({ ...current, connected: true, connecting: false, error: '' }))
      }

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as { type?: string; payload?: unknown; message?: string }
          if (message.type === 'snapshot' && message.payload && typeof message.payload === 'object') {
            const next = normalizePositioningSnapshot(message.payload)
            saveCachedSnapshot(next)
            setSnapshot(next)
          } else if (message.type === 'error') {
            setState((current) => ({ ...current, error: String(message.message || 'Positioning stream error.') }))
          }
          setState((current) => ({ ...current, lastMessageAt: new Date().toISOString() }))
        } catch {
          setState((current) => ({ ...current, error: 'Unable to parse positioning stream message.' }))
        }
      }

      socket.onerror = () => {
        setState((current) => ({ ...current, error: 'Positioning websocket error.' }))
      }

      socket.onclose = () => {
        setState((current) => ({ ...current, connected: false, connecting: false }))
        if (!cancelled) {
          reconnectRef.current = window.setTimeout(connect, 2500)
        }
      }
    }

    connect()
    return () => {
      cancelled = true
      if (reconnectRef.current !== null) window.clearTimeout(reconnectRef.current)
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [init.deviceId, init.enabled, init.environment, init.sessionToken])

  return { snapshot, connection: state }
}
