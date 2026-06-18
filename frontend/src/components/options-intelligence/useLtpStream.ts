import { useState, useEffect, useRef, useCallback } from 'react'

export interface LtpRef {
  ref_id: number
  label: string  // e.g. "24500-CE"
}

export type LtpStreamStatus = 'disconnected' | 'connecting' | 'live'

const _wsScheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
const _wsPort = window.location.port || (window.location.protocol === 'https:' ? '443' : '8000')
const LTP_WS_URL = `${_wsScheme}://${window.location.hostname}:${_wsPort}/ws/oie-ltp`

interface UseLtpStreamParams {
  sessionToken: string
  deviceId: string
  environment: string
  refs: LtpRef[]
  intervalSeconds?: number
}

interface UseLtpStreamResult {
  ltpMap: Map<string, number>
  status: LtpStreamStatus
}

export function useLtpStream({
  sessionToken,
  deviceId,
  environment,
  refs,
  intervalSeconds = 2,
}: UseLtpStreamParams): UseLtpStreamResult {
  const [ltpMap, setLtpMap] = useState<Map<string, number>>(new Map())
  const [status, setStatus] = useState<LtpStreamStatus>('disconnected')
  const wsRef = useRef<WebSocket | null>(null)
  const refsRef = useRef<LtpRef[]>(refs)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closedRef = useRef(false)
  const connectedRef = useRef(false)

  // Always keep refsRef current — used in onopen and set_refs effect
  refsRef.current = refs

  const refsKey = refs.map(r => `${r.ref_id}:${r.label}`).sort().join(',')

  // Connect as soon as we have a sessionToken — don't wait for refs
  useEffect(() => {
    if (!sessionToken) {
      setStatus('disconnected')
      return
    }

    closedRef.current = false
    connectedRef.current = false

    function connect() {
      if (closedRef.current) return
      setStatus('connecting')

      const ws = new WebSocket(LTP_WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        connectedRef.current = true
        setStatus(refsRef.current.length > 0 ? 'live' : 'connecting')
        ws.send(JSON.stringify({
          session_token: sessionToken,
          device_id: deviceId,
          environment,
          refs: refsRef.current,
          interval_seconds: intervalSeconds,
        }))
      }

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string)
          if (msg.type === 'quotes' && msg.quotes && typeof msg.quotes === 'object') {
            setStatus('live')
            setLtpMap(prev => {
              const next = new Map(prev)
              for (const [label, ltp] of Object.entries(msg.quotes as Record<string, number>)) {
                if (typeof ltp === 'number' && ltp > 0) next.set(label, ltp)
              }
              return next
            })
          }
        } catch { /* ignore parse errors */ }
      }

      ws.onerror = () => { /* handled in onclose */ }

      ws.onclose = () => {
        connectedRef.current = false
        wsRef.current = null
        setStatus('disconnected')
        if (!closedRef.current) {
          reconnectTimer.current = setTimeout(connect, 5000)
        }
      }
    }

    connect()

    return () => {
      closedRef.current = true
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      setStatus('disconnected')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionToken, deviceId, environment, intervalSeconds])

  // When refs change, push set_refs to the live connection immediately
  const sendRefs = useCallback(() => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({ type: 'set_refs', refs: refsRef.current }))
    if (refsRef.current.length > 0 && connectedRef.current) setStatus('live')
  }, [])

  useEffect(() => {
    sendRefs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refsKey])

  return { ltpMap, status }
}
