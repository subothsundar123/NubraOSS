import { useState, useEffect, useRef, useCallback } from 'react'
import type { OIEChainResponse, OIEIntelligenceResponse, OIESignalResponse } from './useOIEData'

export type StreamStatus = 'connecting' | 'live' | 'reconnecting' | 'closed'

interface UseOIEStreamParams {
  sessionToken: string
  deviceId: string
  environment: string
  initialUnderlying?: string
  intervalSeconds?: number
}

const _wsScheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
const _wsPort = window.location.port || (window.location.protocol === 'https:' ? '443' : '8000')
const WS_URL = `${_wsScheme}://${window.location.hostname}:${_wsPort}/ws/oie`
const RECONNECT_DELAY = 5000

export function useOIEStream({
  sessionToken,
  deviceId,
  environment,
  initialUnderlying = 'NIFTY',
  intervalSeconds = 30,
}: UseOIEStreamParams) {
  const [intelligence, setIntelligence] = useState<OIEIntelligenceResponse | null>(null)
  const [chain, setChain] = useState<OIEChainResponse | null>(null)
  const [signalReport, setSignalReport] = useState<OIESignalResponse | null>(null)
  const [status, setStatus] = useState<StreamStatus>('connecting')
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [underlying, setUnderlying] = useState(initialUnderlying)
  const [expiry, setExpiry] = useState('')

  const wsRef = useRef<WebSocket | null>(null)
  const reconnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  const configRef = useRef({ sessionToken, deviceId, environment, intervalSeconds })

  // Keep config ref current without triggering reconnects
  useEffect(() => {
    configRef.current = { sessionToken, deviceId, environment, intervalSeconds }
  }, [sessionToken, deviceId, environment, intervalSeconds])

  const connect = useCallback(() => {
    if (!mountedRef.current) return
    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.close()
    }

    setStatus('connecting')
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      const { sessionToken: st, deviceId: di, environment: env, intervalSeconds: iv } = configRef.current
      ws.send(JSON.stringify({
        session_token: st,
        device_id: di,
        environment: env,
        underlying,
        expiry: expiry || null,
        interval_seconds: iv,
      }))
    }

    ws.onmessage = (evt) => {
      if (!mountedRef.current) return
      try {
        const msg = JSON.parse(evt.data as string) as { type: string } & Record<string, unknown>
        if (msg.type === 'data') {
          setStatus('live')
          setError(null)
          setChain(msg.chain as OIEChainResponse)
          setIntelligence(msg.intelligence as OIEIntelligenceResponse)
          setSignalReport(msg.signal as OIESignalResponse)
          setLastUpdate(new Date())
        } else if (msg.type === 'error') {
          setError(msg.message as string)
        }
      } catch { /* ignore parse errors */ }
    }

    ws.onerror = () => {
      if (!mountedRef.current) return
      setStatus('reconnecting')
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      setStatus('reconnecting')
      reconnTimerRef.current = setTimeout(connect, RECONNECT_DELAY)
    }
  }, [underlying, expiry]) // reconnect when underlying or expiry changes

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      if (reconnTimerRef.current) clearTimeout(reconnTimerRef.current)
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
      }
    }
  }, [connect])

  const switchUnderlying = useCallback((newUnderlying: string, newExpiry = '') => {
    setUnderlying(newUnderlying)
    setExpiry(newExpiry)
    // If already connected, send switch command (no reconnect needed)
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        cmd: 'switch',
        underlying: newUnderlying,
        expiry: newExpiry || null,
        interval_seconds: configRef.current.intervalSeconds,
      }))
      setUnderlying(newUnderlying)
      setExpiry(newExpiry)
    }
    // If not connected, `underlying`/`expiry` state change will trigger reconnect via connect deps
  }, [])

  return {
    intelligence,
    chain,
    signalReport,
    status,
    error,
    lastUpdate,
    underlying,
    expiry,
    switchUnderlying,
    setExpiry,
  }
}
