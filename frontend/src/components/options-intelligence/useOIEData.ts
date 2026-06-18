import { useState, useCallback, useRef } from 'react'

const API = '/api/oie'

export interface OIEGreeksAggregates {
  lot_size: number
  net_delta: number | null
  net_gamma: number | null
  net_vega: number | null
  net_theta: number | null
  total_gex: number | null
  gamma_flip_level: number | null
  call_wall: number | null
  put_wall: number | null
  gex_bias: string
  ce_gex_total: number | null
  pe_gex_total: number | null
}

export interface OIEChainStrikeRow {
  strike_price: number
  distance_from_spot: number
  is_atm: boolean
  ce_ref_id: number | null
  ce_oi: number | null
  ce_oi_change: number | null
  ce_iv: number | null
  ce_ltp: number | null
  ce_delta: number | null
  ce_gamma: number | null
  ce_theta: number | null
  ce_vega: number | null
  ce_volume: number | null
  ce_gex: number | null
  pe_ref_id: number | null
  pe_oi: number | null
  pe_oi_change: number | null
  pe_iv: number | null
  pe_ltp: number | null
  pe_delta: number | null
  pe_gamma: number | null
  pe_theta: number | null
  pe_vega: number | null
  pe_volume: number | null
  pe_gex: number | null
  net_gex: number | null
}

export interface OIEChainResponse {
  underlying: string
  spot_price: number | null
  atm_strike: number | null
  expiry: string | null
  lot_size: number
  pcr: number | null
  max_pain: number | null
  straddle_price: number | null
  total_ce_oi: number | null
  total_pe_oi: number | null
  strikes: OIEChainStrikeRow[]
  aggregates: OIEGreeksAggregates
  fetched_at: string
  market_closed: boolean
}

export interface MetricResult {
  key: string
  label: string
  value: number | null
  formatted: string
  interpretation: string
  group: string
  trend: string
  raw: Record<string, unknown>
}

export interface OIEIntelligenceResponse {
  underlying: string
  spot_price: number | null
  atm_strike: number | null
  fetched_at: string
  market_bias: string
  confidence_score: number
  volatility_regime: string
  gamma_regime: string
  dealer_positioning: string
  expected_move_daily: string
  expected_move_weekly: string
  option_seller_favorability: string
  key_levels: {
    call_wall: number | null
    put_wall: number | null
    gamma_flip: number | null
    max_pain: number | null
    spot: number | null
    atm: number | null
  }
  interpretation_bullets: string[]
  metric_summary: Record<string, string>
  metrics: Record<string, MetricResult>
}

interface UseOIEDataParams {
  sessionToken: string
  deviceId: string
  environment: string
}

export interface SignalItem {
  key: string
  label: string
  direction: string
  strength: number
  category: string
  reason: string
  metric_key: string
  metric_value: number | null
  metric_formatted: string
}

export interface OIESignalResponse {
  underlying: string
  generated_at: string
  composite_direction: string
  composite_score: number
  bull_score: number
  bear_score: number
  summary: string
  signals: SignalItem[]
  top_signals: SignalItem[]
}

export function useOIEData({ sessionToken, deviceId, environment }: UseOIEDataParams) {
  const [intelligence, setIntelligence] = useState<OIEIntelligenceResponse | null>(null)
  const [chain, setChain] = useState<OIEChainResponse | null>(null)
  const [signalReport, setSignalReport] = useState<OIESignalResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Single-call refresh: one Nubra API call → chain + intelligence + signals
  const fetchAll = useCallback(async (underlying: string, expiry?: string) => {
    if (abortRef.current) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_token: sessionToken,
          device_id: deviceId,
          environment,
          underlying,
          expiry: expiry || null,
        }),
        signal: ctrl.signal,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { detail?: string }).detail || `HTTP ${res.status}`)
      }
      const data = await res.json() as { chain: OIEChainResponse; intelligence: OIEIntelligenceResponse; signal: OIESignalResponse }
      setChain(data.chain)
      setIntelligence(data.intelligence as OIEIntelligenceResponse)
      setSignalReport(data.signal)
    } catch (e: unknown) {
      if ((e as Error).name === 'AbortError') return
      setError((e as Error).message || 'Failed to fetch market data')
    } finally {
      setLoading(false)
    }
  }, [sessionToken, deviceId, environment])

  // Keep individual fetch methods for backward compatibility with any standalone uses
  const fetchIntelligence = useCallback((underlying: string, expiry?: string) =>
    fetchAll(underlying, expiry), [fetchAll])
  const fetchChain = useCallback((underlying: string, expiry?: string) =>
    fetchAll(underlying, expiry), [fetchAll])
  const fetchSignal = useCallback((underlying: string, expiry?: string) =>
    fetchAll(underlying, expiry), [fetchAll])

  return { intelligence, chain, signalReport, loading, error, fetchIntelligence, fetchChain, fetchSignal, fetchAll }
}
