import { useState, useCallback, useMemo } from 'react'
import type { OIEChainResponse, OIEChainStrikeRow, OIESignalResponse, OIEIntelligenceResponse } from './useOIEData'

export type OptionType = 'CE' | 'PE'
export type TradeAction = 'BUY' | 'SELL'
export type AdviceStatus = 'HOLD' | 'EXIT_NOW' | 'COVER_NOW' | 'BOOK_PARTIAL' | 'TRAIL_SL' | 'WATCH'

export interface TrackedPosition {
  id: string
  underlying: string
  expiry: string | null
  strike: number
  optionType: OptionType
  action: TradeAction
  entryPrice: number
  lots: number
  lotSize: number
  slPrice: number
  targetPrice: number
  addedAt: string
}

export interface LivePosition extends TrackedPosition {
  currentLtp: number | null
  pnlPerLot: number | null
  pnlPct: number | null
  advice: AdviceStatus
  adviceReason: string
  urgency: 'low' | 'medium' | 'high'
  suggestedSl?: number
  suggestedTarget?: number
}

const STORAGE_KEY = 'oie_positions_v1'

function loadStored(): TrackedPosition[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') }
  catch { return [] }
}

function persist(positions: TrackedPosition[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(positions))
}

function r1(n: number) { return Math.round(n * 10) / 10 }

function computeDte(expiry: string | null): number | null {
  if (!expiry || expiry.length < 8) return null
  try {
    const exp = new Date(
      parseInt(expiry.slice(0, 4)),
      parseInt(expiry.slice(4, 6)) - 1,
      parseInt(expiry.slice(6, 8)),
    )
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return Math.max(0, Math.floor((exp.getTime() - today.getTime()) / 86400000))
  } catch { return null }
}

// OI position classification (mirrors ChainTab logic)
function oiTag(oiChange: number | null, isAboveSpot: boolean, isCe: boolean): string | null {
  if (oiChange == null || oiChange === 0) return null
  const isOtm = isCe ? isAboveSpot : !isAboveSpot
  if (oiChange > 0) return isOtm ? 'SB' : 'LB'
  return isOtm ? 'SC' : 'LU'
}

// ── Greeks-aware trailing SL ──────────────────────────────────────────────────
//
// Trail % of floating profit to lock in is driven by:
//   - Delta:  higher delta (more ITM) → lock more of the gain (wider trail ok)
//             lower delta (more OTM)  → lock aggressively (option can die fast)
//   - Theta/LTP: fast decay (>2%/day) → tighten; slow decay (<0.5%/day) → loosen
//
// Only proposed when the result is ≥5% better than the current SL (avoids noise).

function greeksTrailSl(
  pos: TrackedPosition,
  ltp: number,
  pnlPct: number,
  absDelta: number | null,
  thetaRatio: number | null,  // |theta| / ltp
): number | undefined {
  if (pnlPct <= 0) return undefined

  let lockPct: number
  if (absDelta != null) {
    if (absDelta >= 0.60)      lockPct = 0.75  // deep ITM  — lock 75% of gain
    else if (absDelta >= 0.40) lockPct = 0.60  // ATM zone  — lock 60%
    else if (absDelta >= 0.25) lockPct = 0.45  // slight OTM
    else                       lockPct = 0.30  // far OTM   — lock whatever we have
  } else {
    lockPct = 0.50  // fallback: no Greeks available
  }

  // Theta adjustment
  if (thetaRatio != null) {
    if (thetaRatio > 0.02)  lockPct = Math.min(lockPct + 0.12, 0.85)  // >2%/day: tighten
    else if (thetaRatio < 0.005) lockPct = Math.max(lockPct - 0.05, 0.25)  // <0.5%: loosen
  }

  const candidate = r1(pos.entryPrice + (ltp - pos.entryPrice) * lockPct)
  // Only propose if meaningfully better (≥5% above current SL for BUY)
  return candidate > pos.slPrice * 1.05 ? candidate : undefined
}

// ── Sell-side trailing SL ─────────────────────────────────────────────────────
// For shorts, profit = premium decay. Trail the SL down toward LTP as premium shrinks.
// Only propose if ≥5% below current SL.
function sellTrailSl(pos: TrackedPosition, ltp: number, gainPct: number): number | undefined {
  let bufferMult: number
  if (gainPct >= 60)      bufferMult = 1.30  // nearly full decay — tight buffer
  else if (gainPct >= 40) bufferMult = 1.50
  else if (gainPct >= 25) bufferMult = 1.65
  else                    bufferMult = 1.80

  const candidate = r1(ltp * bufferMult)
  return candidate < pos.slPrice * 0.95 ? candidate : undefined
}

// ── Main compute function ─────────────────────────────────────────────────────

function computeLivePosition(
  pos: TrackedPosition,
  chain: OIEChainResponse | null,
  signalReport: OIESignalResponse | null,
  intelligence: OIEIntelligenceResponse | null,
  ltpMap?: Map<string, number>,
): LivePosition {
  const strikeRow: OIEChainStrikeRow | undefined = chain?.strikes.find(s => s.strike_price === pos.strike)
  const chainLtp = pos.optionType === 'CE' ? (strikeRow?.ce_ltp ?? null) : (strikeRow?.pe_ltp ?? null)
  const fastLtp  = ltpMap?.get(`${pos.strike}-${pos.optionType}`) ?? null
  const ltp      = fastLtp ?? chainLtp

  // ── Greeks ────────────────────────────────────────────────────────────────
  const delta    = pos.optionType === 'CE' ? (strikeRow?.ce_delta ?? null) : (strikeRow?.pe_delta ?? null)
  const absDelta = delta != null ? Math.abs(delta) : null
  const theta    = pos.optionType === 'CE' ? (strikeRow?.ce_theta ?? null) : (strikeRow?.pe_theta ?? null)
  const gamma    = pos.optionType === 'CE' ? (strikeRow?.ce_gamma ?? null) : (strikeRow?.pe_gamma ?? null)

  // Theta/LTP ratio: daily decay as fraction of current premium (e.g. 0.015 = 1.5%/day)
  const thetaRatio = (theta != null && ltp != null && ltp > 0) ? Math.abs(theta) / ltp : null

  // ── OI analysis ───────────────────────────────────────────────────────────
  const spot       = chain?.spot_price ?? null
  const oiChange   = pos.optionType === 'CE' ? (strikeRow?.ce_oi_change ?? null) : (strikeRow?.pe_oi_change ?? null)
  const isAboveSpot = spot != null ? pos.strike > spot : false
  const tag        = oiChange != null ? oiTag(oiChange, isAboveSpot, pos.optionType === 'CE') : null

  // ── P&L ───────────────────────────────────────────────────────────────────
  let pnlPerLot: number | null = null
  let pnlPct:    number | null = null
  if (ltp != null) {
    const diff = pos.action === 'BUY' ? ltp - pos.entryPrice : pos.entryPrice - ltp
    pnlPerLot  = r1(diff * pos.lotSize)
    pnlPct     = r1((diff / pos.entryPrice) * 100)
  }

  // ── Signal context ────────────────────────────────────────────────────────
  const direction = signalReport?.composite_direction ?? 'conflicted'
  const score     = signalReport?.composite_score ?? 50
  const levels    = intelligence?.key_levels
  const dte       = computeDte(pos.expiry)

  let advice:       AdviceStatus = 'HOLD'
  let reason:       string = 'Conditions aligned — hold'
  let urgency:      LivePosition['urgency'] = 'low'
  let suggestedSl:  number | undefined
  let suggestedTarget: number | undefined

  // Compact contextual suffix shown in every HOLD/WATCH reason
  const greeksSuffix = [
    absDelta   != null ? `Δ ${absDelta.toFixed(2)}` : null,
    thetaRatio != null ? `θ ${(thetaRatio * 100).toFixed(1)}%/day` : null,
    dte        != null ? `${dte} DTE` : null,
  ].filter(Boolean).join(' · ')

  // ── BUY positions ─────────────────────────────────────────────────────────
  if (pos.action === 'BUY') {

    // 1. Hard exits — highest priority
    if (ltp != null && ltp <= pos.slPrice) {
      advice = 'EXIT_NOW'; urgency = 'high'
      reason = `SL hit — LTP ₹${ltp.toFixed(1)} at SL ₹${pos.slPrice}`

    } else if (absDelta != null && absDelta < 0.15 && pnlPct != null && pnlPct < 0) {
      // Delta collapsed: option deeply OTM and in loss — little chance of recovery
      advice = 'EXIT_NOW'; urgency = 'high'
      reason = `Delta collapsed to ${absDelta.toFixed(2)} — option deeply OTM and in loss. Exit to preserve remaining premium.`

    } else if (pos.optionType === 'CE' && direction === 'bearish') {
      advice = 'EXIT_NOW'; urgency = 'high'
      reason = 'Market flipped BEARISH — CE longs at risk, exit now'

    } else if (pos.optionType === 'PE' && direction === 'bullish') {
      advice = 'EXIT_NOW'; urgency = 'high'
      reason = 'Market flipped BULLISH — PE longs at risk, exit now'

    } else if (pos.optionType === 'CE' && levels?.gamma_flip && spot && spot < levels.gamma_flip) {
      advice = 'EXIT_NOW'; urgency = 'high'
      reason = `Spot (${spot}) below gamma flip (${levels.gamma_flip}) — dealer hedging now amplifies downside`

    } else if (pos.optionType === 'PE' && levels?.gamma_flip && spot && spot > levels.gamma_flip) {
      advice = 'EXIT_NOW'; urgency = 'high'
      reason = `Spot (${spot}) above gamma flip (${levels.gamma_flip}) — dealer hedging now amplifies upside`

    // 2. Book partial
    } else if (ltp != null && ltp >= pos.targetPrice) {
      advice = 'BOOK_PARTIAL'; urgency = 'high'
      const trail = pnlPct != null ? greeksTrailSl(pos, ltp, pnlPct, absDelta, thetaRatio) : undefined
      suggestedSl = trail
      reason = `Target ₹${pos.targetPrice} reached. Book ½ profit.${trail ? ` Trail SL on remainder to ₹${trail}.` : ''}`

    } else if (pos.optionType === 'CE' && levels?.call_wall && spot && spot > 0 && (levels.call_wall - spot) / spot < 0.005 && levels.call_wall > spot) {
      advice = 'BOOK_PARTIAL'; urgency = 'medium'
      suggestedSl = ltp != null && pnlPct != null ? greeksTrailSl(pos, ltp, pnlPct, absDelta, thetaRatio) : undefined
      reason = `Approaching call wall ${levels.call_wall} — strong OI-based resistance. Book partial, trail rest.${greeksSuffix ? ` [${greeksSuffix}]` : ''}`

    } else if (pos.optionType === 'PE' && levels?.put_wall && spot && spot > 0 && (spot - levels.put_wall) / spot < 0.005 && spot > levels.put_wall) {
      advice = 'BOOK_PARTIAL'; urgency = 'medium'
      suggestedSl = ltp != null && pnlPct != null ? greeksTrailSl(pos, ltp, pnlPct, absDelta, thetaRatio) : undefined
      reason = `Approaching put wall ${levels.put_wall} — key OI support. Book partial, trail rest.${greeksSuffix ? ` [${greeksSuffix}]` : ''}`

    // 3. WATCH — signal or Greek concerns
    } else if (direction === 'conflicted') {
      advice = 'WATCH'; urgency = 'medium'
      suggestedSl = ltp != null && pnlPct != null ? greeksTrailSl(pos, ltp, pnlPct, absDelta, thetaRatio) : undefined
      const thetaWarn = thetaRatio != null && thetaRatio > 0.015 ? ` Theta eating ${(thetaRatio * 100).toFixed(1)}%/day of premium.` : ''
      reason = `Signals conflicted (${score}%).${thetaWarn}${suggestedSl ? ` Tighten SL to ₹${suggestedSl}` : ' Consider reducing size'}.${greeksSuffix ? ` [${greeksSuffix}]` : ''}`

    } else if (thetaRatio != null && thetaRatio > 0.02 && dte != null && dte <= 7) {
      // Fast theta + near expiry even if direction is aligned
      advice = 'WATCH'; urgency = 'medium'
      suggestedSl = ltp != null && pnlPct != null ? greeksTrailSl(pos, ltp, pnlPct, absDelta, thetaRatio) : undefined
      reason = `Theta burning ${(thetaRatio * 100).toFixed(1)}%/day with ${dte} DTE — time decay accelerating.${suggestedSl ? ` Trail SL to ₹${suggestedSl}.` : ' Exit if no fresh momentum.'}`

    } else if (tag === 'LU' && pos.optionType === 'CE') {
      // Long unwinding on CE = institutional CE longs reducing → warning
      advice = 'WATCH'; urgency = 'medium'
      suggestedSl = ltp != null && pnlPct != null ? greeksTrailSl(pos, ltp, pnlPct, absDelta, thetaRatio) : undefined
      reason = `OI: long unwinding at ${pos.strike} CE — institutions reducing CE longs.${suggestedSl ? ` Trail SL to ₹${suggestedSl}.` : ''} [${greeksSuffix || tag}]`

    } else if (tag === 'LU' && pos.optionType === 'PE') {
      advice = 'WATCH'; urgency = 'medium'
      suggestedSl = ltp != null && pnlPct != null ? greeksTrailSl(pos, ltp, pnlPct, absDelta, thetaRatio) : undefined
      reason = `OI: long unwinding at ${pos.strike} PE — bears reducing exposure.${suggestedSl ? ` Trail SL to ₹${suggestedSl}.` : ''} [${greeksSuffix || tag}]`

    } else if (score < 56 && ((pos.optionType === 'CE' && direction === 'bullish') || (pos.optionType === 'PE' && direction === 'bearish'))) {
      advice = 'WATCH'; urgency = 'low'
      suggestedSl = ltp != null && pnlPct != null ? greeksTrailSl(pos, ltp, pnlPct, absDelta, thetaRatio) : undefined
      reason = `Signal weakening (${score}% confidence).${suggestedSl ? ` Trail SL to ₹${suggestedSl}.` : ' Be ready to exit.'} [${greeksSuffix}]`

    // 4. TRAIL_SL — profit is meaningful, trail justified by Greeks
    } else if (ltp != null && pnlPct != null && pnlPct >= 15) {
      const trail = greeksTrailSl(pos, ltp, pnlPct, absDelta, thetaRatio)
      if (trail != null) {
        advice = 'TRAIL_SL'; urgency = 'low'
        suggestedSl = trail
        const lockedPct = r1((trail - pos.entryPrice) / pos.entryPrice * 100)
        reason = `Up ${pnlPct.toFixed(1)}% — trail SL to ₹${trail} (locks in ${lockedPct.toFixed(1)}% gain). [${greeksSuffix}]`
      } else {
        // Trail not worthwhile yet — show context
        advice = 'HOLD'; urgency = 'low'
        reason = `Up ${pnlPct.toFixed(1)}% — SL ₹${pos.slPrice} already positioned well. [${greeksSuffix}]`
      }

    // 5. Move SL to breakeven when far enough in profit
    } else if (ltp != null && ltp > pos.entryPrice * 1.25 && pos.slPrice < pos.entryPrice) {
      advice = 'TRAIL_SL'; urgency = 'low'
      suggestedSl = pos.entryPrice  // move to breakeven
      reason = `Up ${pnlPct?.toFixed(1) ?? '—'}% — move SL to entry ₹${pos.entryPrice} to lock in breakeven. [${greeksSuffix}]`

    // 6. HOLD — everything aligned
    } else {
      advice = 'HOLD'; urgency = 'low'
      const aligned = (pos.optionType === 'CE' && direction === 'bullish') || (pos.optionType === 'PE' && direction === 'bearish')
      if (ltp != null) {
        const gap = r1(((ltp - pos.slPrice) / ltp) * 100)
        reason = aligned
          ? `${direction.toUpperCase()} (${score}%) aligned. SL ₹${pos.slPrice} is ${gap.toFixed(1)}% below LTP.${greeksSuffix ? ` [${greeksSuffix}]` : ''}`
          : `Direction: ${direction} — no exit signal yet. SL ₹${pos.slPrice} is ${gap.toFixed(1)}% below LTP.${greeksSuffix ? ` [${greeksSuffix}]` : ''}`
      } else {
        reason = aligned
          ? `${direction.toUpperCase()} (${score}%) aligned — hold.${greeksSuffix ? ` [${greeksSuffix}]` : ''}`
          : `Direction: ${direction} — hold.${greeksSuffix ? ` [${greeksSuffix}]` : ''}`
      }
    }

    // DTE override — only escalates HOLD/low-urgency states
    if (dte !== null && advice === 'HOLD') {
      if (dte <= 3) {
        advice = 'WATCH'; urgency = 'high'
        suggestedSl = ltp != null && pnlPct != null ? greeksTrailSl(pos, ltp, pnlPct, absDelta, thetaRatio) : undefined
        reason = `${dte} DTE — expiry imminent, theta/gamma risk severe.${suggestedSl ? ` Trail SL to ₹${suggestedSl}.` : ' Exit or roll now.'}`
      } else if (dte <= 5) {
        advice = 'WATCH'; urgency = 'medium'
        const trail = ltp != null && pnlPct != null ? greeksTrailSl(pos, ltp, pnlPct, absDelta, thetaRatio) : undefined
        suggestedSl = trail ?? suggestedSl
        if (pnlPct != null && pnlPct > 0) {
          reason = `${dte} DTE — up ${pnlPct.toFixed(1)}%, theta accelerating.${suggestedSl ? ` Trail SL to ₹${suggestedSl}.` : ' Consider exiting today.'}`
        } else {
          reason = `${dte} DTE — rapid time decay. Cut losses or roll to next expiry.`
        }
      }
    }

  // ── SELL positions ──────────────────────────────────────────────────────────
  } else {

    // 1. Hard cover
    if (ltp != null && ltp >= pos.slPrice) {
      advice = 'COVER_NOW'; urgency = 'high'
      reason = `SL hit — LTP ₹${ltp.toFixed(1)} at/above SL ₹${pos.slPrice} — cover immediately`

    } else if (pos.optionType === 'CE' && direction === 'bullish') {
      advice = 'COVER_NOW'; urgency = 'high'
      reason = 'Market BULLISH — CE shorts are dangerous, cover immediately'

    } else if (pos.optionType === 'PE' && direction === 'bearish') {
      advice = 'COVER_NOW'; urgency = 'high'
      reason = 'Market BEARISH — PE shorts are dangerous, cover immediately'

    } else if (pos.optionType === 'CE' && levels?.call_wall && spot && spot >= levels.call_wall) {
      advice = 'COVER_NOW'; urgency = 'high'
      reason = `Spot broke through call wall ${levels.call_wall} — CE sellers cover now`

    } else if (pos.optionType === 'PE' && levels?.put_wall && spot && spot <= levels.put_wall) {
      advice = 'COVER_NOW'; urgency = 'high'
      reason = `Spot broke through put wall ${levels.put_wall} — PE sellers cover now`

    // 2. Book partial
    } else if (ltp != null && ltp <= pos.targetPrice) {
      advice = 'BOOK_PARTIAL'; urgency = 'high'
      reason = `Target hit — premium decayed to ₹${ltp.toFixed(1)} (${Math.abs(pnlPct ?? 0).toFixed(1)}% gain). Book profit.`

    } else if (dte !== null && dte <= 21 && pnlPct != null && Math.abs(pnlPct) > 20) {
      // 21-DTE rule: gamma risk accelerates inside 21 days for shorts
      advice = 'BOOK_PARTIAL'; urgency = 'medium'
      const gammaNote = gamma != null ? ` Gamma ${gamma.toFixed(4)} — convexity risk rising.` : ''
      reason = `${dte} DTE inside 21-day gamma risk zone.${gammaNote} ${Math.abs(pnlPct).toFixed(1)}% captured — consider closing.${greeksSuffix ? ` [${greeksSuffix}]` : ''}`

    // 3. WATCH — OI or signal concerns for shorts
    } else if (tag === 'SC' && pos.optionType === 'CE') {
      // CE short covering = writers buying back = CE price rising → dangerous for short
      advice = 'WATCH'; urgency = 'medium'
      suggestedSl = ltp != null && pnlPct != null ? sellTrailSl(pos, ltp, Math.abs(pnlPct)) : undefined
      reason = `OI: CE short covering at ${pos.strike} — writers buying back, CE price may spike.${suggestedSl ? ` Tighten SL to ₹${suggestedSl}.` : ''}`

    } else if (tag === 'SC' && pos.optionType === 'PE') {
      advice = 'WATCH'; urgency = 'medium'
      suggestedSl = ltp != null && pnlPct != null ? sellTrailSl(pos, ltp, Math.abs(pnlPct)) : undefined
      reason = `OI: PE short covering at ${pos.strike} — writers buying back.${suggestedSl ? ` Tighten SL to ₹${suggestedSl}.` : ''}`

    } else if (direction === 'conflicted') {
      advice = 'WATCH'; urgency = 'medium'
      if (ltp != null && pnlPct != null && Math.abs(pnlPct) > 10) {
        suggestedSl = sellTrailSl(pos, ltp, Math.abs(pnlPct))
        reason = `Mixed signals (${score}%).${suggestedSl ? ` Trail SL to ₹${suggestedSl}` : ''} — protect ${Math.abs(pnlPct).toFixed(1)}% gain.${greeksSuffix ? ` [${greeksSuffix}]` : ''}`
      } else {
        reason = `Mixed signals (${score}%) — wait for direction confirmation before adding.${greeksSuffix ? ` [${greeksSuffix}]` : ''}`
      }

    // 4. HOLD — theta working, trail SL as premium decays
    } else {
      advice = 'HOLD'; urgency = 'low'
      if (ltp != null && pnlPct != null) {
        const gainPct = Math.abs(pnlPct)
        const thetaNote = thetaRatio != null ? ` Theta collecting ${(thetaRatio * 100).toFixed(1)}%/day.` : ''
        if (gainPct >= 50) {
          suggestedSl = sellTrailSl(pos, ltp, gainPct)
          reason = `${gainPct.toFixed(1)}% premium captured.${thetaNote}${suggestedSl ? ` Trail SL to ₹${suggestedSl} to secure gains.` : ' Consider closing.'} [${greeksSuffix}]`
        } else if (gainPct >= 25) {
          suggestedSl = sellTrailSl(pos, ltp, gainPct)
          reason = `${gainPct.toFixed(1)}% decayed.${thetaNote}${suggestedSl ? ` Trail SL to ₹${suggestedSl}.` : ''} [${greeksSuffix}]`
        } else {
          reason = `Premium decaying — theta working for you.${thetaNote} SL at ₹${pos.slPrice} (${r1(((pos.slPrice - ltp) / ltp) * 100).toFixed(1)}% above LTP). [${greeksSuffix}]`
        }
      } else {
        reason = `Premium decaying as expected — theta working in your favour.${greeksSuffix ? ` [${greeksSuffix}]` : ''}`
      }
    }
  }

  return {
    ...pos,
    currentLtp: ltp,
    pnlPerLot,
    pnlPct,
    advice,
    adviceReason: reason,
    urgency,
    suggestedSl,
    suggestedTarget,
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePositionTracker(
  chain: OIEChainResponse | null,
  signalReport: OIESignalResponse | null,
  intelligence: OIEIntelligenceResponse | null,
  ltpMap?: Map<string, number>,
) {
  const [positions, setPositions] = useState<TrackedPosition[]>(loadStored)

  const addPosition = useCallback((p: Omit<TrackedPosition, 'id' | 'addedAt'>) => {
    const newPos: TrackedPosition = { ...p, id: crypto.randomUUID(), addedAt: new Date().toISOString() }
    setPositions(prev => { const next = [...prev, newPos]; persist(next); return next })
  }, [])

  const removePosition = useCallback((id: string) => {
    setPositions(prev => { const next = prev.filter(p => p.id !== id); persist(next); return next })
  }, [])

  const updateSl = useCallback((id: string, newSl: number) => {
    setPositions(prev => { const next = prev.map(p => p.id === id ? { ...p, slPrice: newSl } : p); persist(next); return next })
  }, [])

  const updateTarget = useCallback((id: string, newTarget: number) => {
    setPositions(prev => { const next = prev.map(p => p.id === id ? { ...p, targetPrice: newTarget } : p); persist(next); return next })
  }, [])

  const livePositions = useMemo<LivePosition[]>(
    () => positions.map(p => computeLivePosition(p, chain, signalReport, intelligence, ltpMap)),
    [positions, chain, signalReport, intelligence, ltpMap],
  )

  return { livePositions, positions, addPosition, removePosition, updateSl, updateTarget }
}
