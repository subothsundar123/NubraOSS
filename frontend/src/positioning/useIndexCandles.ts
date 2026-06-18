import { useEffect, useMemo, useState } from 'react'
import { useVolumeQuotesWS } from '../hooks/useVolumeQuotesWS'
import type { DrawerCandle } from './useInstrumentContext'

interface DrilldownPoint {
  time_ist: string
  epoch_ms?: number | null
  open?: number | null
  high?: number | null
  low?: number | null
  close: number
  volume: number
}

interface UseIndexCandlesParams {
  enabled: boolean
  underlying: string
  sessionToken: string
  deviceId: string
  environment: 'PROD' | 'UAT'
  spotPrice?: number | null
}

const CANDLE_POLL_MS = 60_000

function parsePointTime(value: string, index: number, total: number): number {
  const parsed = Date.parse(value)
  if (Number.isFinite(parsed)) return parsed
  return Date.now() - (total - index) * 60_000
}

function toCandles(points: DrilldownPoint[]): DrawerCandle[] {
  return points.map((point, index) => {
    const prev = points[index - 1]?.close ?? point.close
    const open = point.open ?? prev
    const high = point.high ?? Math.max(open, point.close)
    const low = point.low ?? Math.min(open, point.close)
    return {
      epoch_ms: point.epoch_ms ?? parsePointTime(point.time_ist, index, points.length),
      open,
      high,
      low,
      close: point.close,
      volume: point.volume,
    }
  })
}

export function useIndexCandles(params: UseIndexCandlesParams) {
  const [points, setPoints] = useState<DrilldownPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [isStale, setIsStale] = useState(false)
  const [sessionDate, setSessionDate] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Index quotes (NIFTY, BANKNIFTY) don't flow through the equity volume-quotes WS.
  // Spot price comes exclusively from the option chain response's spot_price field.
  const quoteStream = useVolumeQuotesWS({
    enabled: false,
    session_token: params.sessionToken,
    device_id: params.deviceId,
    environment: params.environment,
    symbols: [],
  })
  const quote = quoteStream.quotes[params.underlying]

  useEffect(() => {
    if (!params.enabled || !params.sessionToken) {
      setPoints([])
      return
    }
    let cancelled = false

    const doFetch = (showLoading: boolean) => {
      if (showLoading) setLoading(true)
      fetch('/api/positioning/index-candles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_token: params.sessionToken,
          device_id: params.deviceId,
          environment: params.environment,
          underlying: params.underlying,
        }),
      })
        .then(async (r) => {
          const payload = await r.json() as { points?: DrilldownPoint[]; is_stale?: boolean; session_date?: string | null; fetch_error?: string | null }
          if (!cancelled) {
            setPoints(payload.points ?? [])
            setIsStale(payload.is_stale ?? false)
            setSessionDate(payload.session_date ?? null)
            setFetchError(payload.fetch_error ?? null)
          }
        })
        .catch(() => {})
        .finally(() => { if (!cancelled) setLoading(false) })
    }

    doFetch(true)
    const interval = setInterval(() => doFetch(false), CANDLE_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [params.enabled, params.sessionToken, params.deviceId, params.environment, params.underlying])

  const candles = useMemo(() => {
    const base = toCandles(points)
    if (!base.length || !quote?.last_price) return base
    const latest = base[base.length - 1]
    return [
      ...base.slice(0, -1),
      {
        ...latest,
        close: quote.last_price,
        high: Math.max(latest.high, quote.last_price),
        low: Math.min(latest.low, quote.last_price),
        volume: quote.volume ?? latest.volume,
      },
    ]
  }, [points, quote?.last_price, quote?.volume])

  // spotPrice from option chain used as live indicator when WS quote isn't available
  const latestPrice = quote?.last_price ?? params.spotPrice ?? (candles.length ? candles[candles.length - 1].close : null)

  return { candles, loading, latestPrice, quoteState: quoteStream.state, isStale, sessionDate, fetchError }
}
