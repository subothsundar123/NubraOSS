import { useCallback, useEffect, useRef, useState } from 'react'

export interface OptionChainStrikeRow {
  strike_price: number
  distance_from_spot: number
  is_atm: boolean
  ce_ref_id: number | null
  ce_oi: number | null
  ce_oi_change: number | null
  ce_iv: number | null
  ce_ltp: number | null
  ce_delta: number | null
  ce_volume: number | null
  pe_ref_id: number | null
  pe_oi: number | null
  pe_oi_change: number | null
  pe_iv: number | null
  pe_ltp: number | null
  pe_delta: number | null
  pe_volume: number | null
}

export interface OptionChainData {
  underlying: string
  spot_price: number | null
  atm_strike: number | null
  expiry: string | null
  pcr: number | null
  max_pain: number | null
  straddle_price: number | null
  total_ce_oi: number | null
  total_pe_oi: number | null
  strikes: OptionChainStrikeRow[]
  fetched_at: string
  market_closed?: boolean
}

interface UseOptionChainParams {
  enabled: boolean
  underlying: string
  sessionToken: string
  deviceId: string
  environment: 'PROD' | 'UAT'
}

const CACHE_KEY_PREFIX = 'positioning.optionchain.v1.'
const CACHE_MAX_AGE_MS = 8 * 60 * 60 * 1000  // 8 hours — covers overnight gap
const POLL_MS = 30_000

function cacheKey(underlying: string) {
  return CACHE_KEY_PREFIX + underlying.toUpperCase()
}

function loadCache(underlying: string): { data: OptionChainData; savedAt: number } | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(underlying))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { savedAt: number; data: OptionChainData }
    if (Date.now() - parsed.savedAt > CACHE_MAX_AGE_MS) {
      sessionStorage.removeItem(cacheKey(underlying))
      return null
    }
    // Reject cached entries that have no real data
    if (!parsed.data?.strikes?.length) {
      sessionStorage.removeItem(cacheKey(underlying))
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function saveCache(underlying: string, data: OptionChainData) {
  // Only persist responses that have actual chain data — don't cache empty-strikes partials
  if (!data.strikes || data.strikes.length === 0) return
  try {
    sessionStorage.setItem(cacheKey(underlying), JSON.stringify({ savedAt: Date.now(), data }))
  } catch {}
}

export function useOptionChain(params: UseOptionChainParams) {
  const cached = loadCache(params.underlying)
  const [data, setData] = useState<OptionChainData | null>(cached?.data ?? null)
  const [isStale, setIsStale] = useState(Boolean(cached))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fetchingRef = useRef(false)

  const fetchChain = useCallback(async () => {
    if (!params.enabled || !params.sessionToken || fetchingRef.current) return
    fetchingRef.current = true
    setLoading(true)
    try {
      const response = await fetch('/api/positioning/option-chain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_token: params.sessionToken,
          device_id: params.deviceId,
          environment: params.environment,
          underlying: params.underlying,
        }),
      })
      const payload = await response.json() as unknown
      if (!response.ok) {
        const p = payload as Record<string, unknown>
        const detail = p?.detail
        throw new Error(typeof detail === 'string' ? detail : 'Failed to load option chain.')
      }
      const fresh = payload as OptionChainData
      saveCache(params.underlying, fresh)
      setData(fresh)
      setIsStale(false)
      setError('')
    } catch (err) {
      // On failure, keep showing cached data (marked stale) rather than blanking the screen
      const msg = err instanceof Error ? err.message : 'Failed to load option chain.'
      setError(data ? '' : msg)   // suppress error banner if we have stale data to show
      if (!data) setError(msg)
    } finally {
      fetchingRef.current = false
      setLoading(false)
    }
  }, [params.enabled, params.sessionToken, params.deviceId, params.environment, params.underlying, data])

  useEffect(() => {
    if (!params.enabled) {
      setData(null)
      setError('')
      return
    }
    fetchChain()
    timerRef.current = setInterval(fetchChain, POLL_MS)
    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current)
    }
  }, [params.enabled, fetchChain])

  return { data, loading, error, isStale, refetch: fetchChain }
}
