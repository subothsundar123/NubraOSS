import { useEffect, useMemo, useState } from 'react'
import { useVolumeQuotesWS } from '../hooks/useVolumeQuotesWS'
import type { ComputedOverlay, ComputedSignals } from '../types/indicators'
import type { OpportunitySnapshot } from './types'

interface InstrumentContextParams {
  enabled: boolean
  symbol: string | null
  sessionToken: string
  deviceId: string
  environment: 'PROD' | 'UAT'
  opportunity?: OpportunitySnapshot['rows'][number] | null
}

interface DrilldownPoint {
  time_ist: string
  epoch_ms?: number | null
  open?: number | null
  high?: number | null
  low?: number | null
  close: number
  volume: number
  session_vwap?: number | null
  is_partial?: boolean
}

interface DrilldownResponse {
  symbol: string
  display_name: string
  exchange: string
  sector: string | null
  interval: string
  latest_candle_ist: string | null
  baseline_average_volume: number | null
  vwap?: {
    latest_vwap?: number | null
    distance_pct?: number | null
    relation?: string
    confidence?: number
  }
  opening_ranges?: Record<string, {
    minutes: number
    high: number | null
    low: number | null
    state: string
    confidence: number
  }>
  structure?: {
    direction: string
    phase: string
    confidence: number
    events: Array<Record<string, unknown>>
  }
  points: DrilldownPoint[]
}

interface CandlesResponse {
  symbol: string
  exchange: string
  interval: string
  points: DrilldownPoint[]
}

export interface DrawerCandle {
  epoch_ms: number
  open: number
  high: number
  low: number
  close: number
  volume: number | null
}

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

function vwapOverlay(candles: DrawerCandle[]): ComputedOverlay[] {
  let cumulativePriceVolume = 0
  let cumulativeVolume = 0
  const points = candles
    .map((candle) => {
      const volume = candle.volume ?? 0
      cumulativePriceVolume += candle.close * volume
      cumulativeVolume += volume
      if (cumulativeVolume <= 0) return null
      return {
        time: Math.floor(candle.epoch_ms / 1000),
        value: cumulativePriceVolume / cumulativeVolume,
      }
    })
    .filter((point): point is { time: number; value: number } => point !== null)

  return points.length
    ? [{
        indicatorId: 'drawer-vwap',
        lineId: 'vwap',
        overlayType: 'line',
        color: '#78c9ff',
        thickness: 2,
        points,
      }]
    : []
}

function structureSignals(candles: DrawerCandle[]): ComputedSignals[] {
  if (candles.length < 8) return []
  const latest = candles[candles.length - 1]
  const recent = candles.slice(-8, -1)
  const recentHigh = Math.max(...recent.map((candle) => candle.high))
  const recentLow = Math.min(...recent.map((candle) => candle.low))
  const signals = []
  if (latest.close > recentHigh) {
    signals.push({ time: Math.floor(latest.epoch_ms / 1000), price: latest.close, side: 'buy' as const, label: 'Structure high' })
  } else if (latest.close < recentLow) {
    signals.push({ time: Math.floor(latest.epoch_ms / 1000), price: latest.close, side: 'sell' as const, label: 'Structure low' })
  }
  return signals.length
    ? [{ indicatorId: 'drawer-structure', signals, buyMarkerColor: '#7ccf5e', sellMarkerColor: '#f14242' }]
    : []
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>
    const detail = p.detail
    if (typeof detail === 'string' && detail) return detail
    if (Array.isArray(detail) && typeof (detail[0] as Record<string, unknown>)?.msg === 'string') {
      return (detail[0] as Record<string, unknown>).msg as string
    }
    if (typeof p.message === 'string' && p.message) return p.message
  }
  return fallback
}

export function useInstrumentContext(params: InstrumentContextParams) {
  const symbol = params.symbol?.trim().toUpperCase() ?? ''
  const exchange = params.opportunity?.exchange ?? 'NSE'

  // Phase 1 — fast candles from local DB (renders chart immediately)
  const [fastPoints, setFastPoints] = useState<DrilldownPoint[]>([])
  const [candlesLoading, setCandlesLoading] = useState(false)

  // Phase 2 — drilldown metadata (VWAP state text, opening range, structure labels)
  const [drilldown, setDrilldown] = useState<DrilldownResponse | null>(null)
  const [drilldownLoading, setDrilldownLoading] = useState(false)

  const [error, setError] = useState('')

  const quoteStream = useVolumeQuotesWS({
    enabled: params.enabled && Boolean(symbol) && Boolean(params.sessionToken),
    session_token: params.sessionToken,
    device_id: params.deviceId,
    environment: params.environment,
    symbols: symbol ? [symbol] : [],
  })
  const quote = symbol ? quoteStream.quotes[symbol] : undefined

  // Phase 1: lightweight candle fetch — fires first, no universe join
  useEffect(() => {
    if (!params.enabled || !symbol || !params.sessionToken) {
      setFastPoints([])
      return
    }
    let cancelled = false
    setCandlesLoading(true)
    fetch('/api/positioning/candles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_token: params.sessionToken,
        device_id: params.deviceId,
        environment: params.environment,
        symbol,
        exchange,
      }),
    })
      .then(async (response) => {
        const payload = await response.json() as unknown
        if (!response.ok) {
          // Silently fall back — drilldown will fill candles via its own points
          return
        }
        if (!cancelled) {
          setFastPoints((payload as CandlesResponse).points ?? [])
        }
      })
      .catch(() => {
        // Non-fatal: chart will still render from drilldown points if available
      })
      .finally(() => {
        if (!cancelled) setCandlesLoading(false)
      })
    return () => { cancelled = true }
  }, [params.deviceId, params.enabled, params.environment, params.sessionToken, symbol, exchange])

  // Phase 2: full drilldown for metadata — fires concurrently
  useEffect(() => {
    if (!params.enabled || !symbol || !params.sessionToken) {
      setDrilldown(null)
      setError('')
      return
    }
    let cancelled = false
    setDrilldownLoading(true)
    setError('')
    fetch('/api/volume-breakout/drilldown', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_token: params.sessionToken,
        device_id: params.deviceId,
        environment: params.environment,
        universe_slug: 'volume-dashboard-all-nse',
        universe_mode: 'all_nse',
        interval: '1m',
        lookback_days: 5,
        refresh_seconds: 30,
        min_volume_ratio: 1.5,
        limit: 20,
        universe_limit: 300,
        symbol,
        points: 72,
      }),
    })
      .then(async (response) => {
        const payload = await response.json() as unknown
        if (!response.ok) {
          throw new Error(extractErrorMessage(payload, 'Unable to load drilldown data.'))
        }
        if (!cancelled) setDrilldown(payload as DrilldownResponse)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unable to load drilldown data.')
      })
      .finally(() => {
        if (!cancelled) setDrilldownLoading(false)
      })
    return () => { cancelled = true }
  }, [params.deviceId, params.enabled, params.environment, params.sessionToken, symbol])

  // Prefer fast candles; fall back to drilldown points if fast fetch returned nothing
  const basePoints = fastPoints.length ? fastPoints : (drilldown?.points ?? [])

  const candles = useMemo(() => {
    const base = toCandles(basePoints)
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
  }, [basePoints, quote?.last_price, quote?.volume])

  const loading = candlesLoading
  const latestPrice = quote?.last_price ?? params.opportunity?.last_price ?? candles[candles.length - 1]?.close ?? null
  const overlays = useMemo(() => vwapOverlay(candles), [candles])
  const signals = useMemo(() => structureSignals(candles), [candles])
  const vwapPoints = overlays[0]?.points ?? []
  const latestVwap = drilldown?.vwap?.latest_vwap ?? (vwapPoints.length ? vwapPoints[vwapPoints.length - 1].value : null)
  const openingRange = drilldown?.opening_ranges?.['15m'] ?? null
  const openingRangeHigh = openingRange?.high ?? (candles.length ? Math.max(...candles.slice(0, Math.min(15, candles.length)).map((candle) => candle.high)) : null)
  const openingRangeLow = openingRange?.low ?? (candles.length ? Math.min(...candles.slice(0, Math.min(15, candles.length)).map((candle) => candle.low)) : null)

  return {
    candles,
    drilldown,
    error,
    latestPrice,
    latestVwap,
    loading,
    openingRangeHigh,
    openingRangeLow,
    openingRange,
    overlays,
    quote,
    quoteState: quoteStream.state,
    quoteStatus: quoteStream.status,
    signals,
    structure: drilldown?.structure ?? null,
    vwap: drilldown?.vwap ?? null,
  }
}
