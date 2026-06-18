import { useState, useMemo } from 'react'
import type { OIEChainResponse, OIEChainStrikeRow, OIESignalResponse, OIEIntelligenceResponse } from './useOIEData'

export interface TrackRequest {
  strike: number
  optionType: 'CE' | 'PE'
  ltp: number
  underlying: string
  expiry: string | null
  lotSize: number
}

interface SideRec {
  action: 'BUY' | 'SELL'
  entry: number
  sl: number
  target: number
  strength: 'strong' | 'moderate'
}

interface StrikeRec {
  ce: SideRec | null
  pe: SideRec | null
}

interface Props {
  chain: OIEChainResponse | null
  spotPrice?: number | null
  onTrackPosition?: (req: TrackRequest) => void
  signalReport?: OIESignalResponse | null
  intelligence?: OIEIntelligenceResponse | null
}

// ── Formatters ────────────────────────────────────────────────────────────────

const fmtOI = (v: number | null | undefined) => {
  if (v == null) return '—'
  if (v >= 1e7) return `${(v / 1e7).toFixed(2)}Cr`
  if (v >= 1e5) return `${(v / 1e5).toFixed(2)}L`
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`
  return String(Math.round(v))
}

const fmtOIChg = (v: number | null | undefined) => {
  if (v == null) return '—'
  const abs = Math.abs(v)
  const str = abs >= 1e5 ? `${(abs / 1e5).toFixed(1)}L` : abs >= 1e3 ? `${(abs / 1e3).toFixed(1)}K` : String(Math.round(abs))
  return v >= 0 ? `+${str}` : `−${str}`
}

const fmtIV = (v: number | null | undefined) =>
  v == null ? '—' : `${(v * 100).toFixed(1)}`

const fmtLTP = (v: number | null | undefined) =>
  v == null ? '—' : v.toFixed(1)

const fmtDelta = (v: number | null | undefined) =>
  v == null ? '—' : v.toFixed(2)

const fmtGex = (v: number | null | undefined) => {
  if (v == null) return '—'
  const cr = v / 1e7
  if (Math.abs(cr) >= 1000) return `${(cr / 1000).toFixed(1)}K`
  return cr.toFixed(0)
}

// ── OI position classification ────────────────────────────────────────────────
// OTM CE OI builds → writers (Short Buildup). ITM CE OI builds → buyers (Long Buildup).

function oiTag(oiChange: number | null, isAboveSpot: boolean, isCe: boolean): string | null {
  if (oiChange == null || oiChange === 0) return null
  const isOtm = isCe ? isAboveSpot : !isAboveSpot
  if (oiChange > 0) return isOtm ? 'SB' : 'LB'
  return isOtm ? 'SC' : 'LU'
}

const OI_TAG_COLORS: Record<string, string> = {
  LB: 'rgba(34,197,94,0.9)',
  SB: 'rgba(239,68,68,0.9)',
  SC: 'rgba(251,191,36,0.9)',
  LU: 'rgba(148,163,184,0.7)',
}

const OI_TAG_TITLE: Record<string, string> = {
  LB: 'Long Buildup — buyers adding positions',
  SB: 'Short Buildup — writers adding positions',
  SC: 'Short Covering — writers closing positions',
  LU: 'Long Unwinding — buyers closing positions',
}

// ── Trade signal computation ──────────────────────────────────────────────────

function r1(n: number) { return Math.round(n * 10) / 10 }

function computeRec(
  s: OIEChainStrikeRow,
  direction: string,
  score: number,
  levels: { gamma_flip?: number | null; call_wall?: number | null; put_wall?: number | null } | null | undefined,
  spot: number | null,
  atmStrike: number | null,
): StrikeRec {
  const empty: StrikeRec = { ce: null, pe: null }
  if (score < 52 || direction === 'conflicted' || !spot) return empty

  // Infer step size from ATM distance
  const step = atmStrike != null ? Math.abs(atmStrike - Math.round(atmStrike / 100) * 100) || 50 : 50
  const stepsFromAtm = atmStrike != null ? Math.abs(s.strike_price - atmStrike) : null
  if (stepsFromAtm != null && stepsFromAtm > step * 4) return empty

  const isAboveSpot = s.strike_price > spot
  const aboveFlip = levels?.gamma_flip != null && spot > levels.gamma_flip
  const belowFlip = levels?.gamma_flip != null && spot < levels.gamma_flip
  const nearCallWall = levels?.call_wall != null && Math.abs(s.strike_price - levels.call_wall) <= step * 1
  const nearPutWall = levels?.put_wall != null && Math.abs(s.strike_price - levels.put_wall) <= step * 1

  const ceTag = oiTag(s.ce_oi_change, isAboveSpot, true)
  const peTag = oiTag(s.pe_oi_change, isAboveSpot, false)

  function makeSide(action: 'BUY' | 'SELL', ltp: number | null): SideRec | null {
    if (!ltp || ltp <= 0) return null
    return {
      action,
      entry: ltp,
      sl: action === 'BUY' ? r1(ltp * 0.70) : r1(ltp * 1.50),
      target: action === 'BUY' ? r1(ltp * 1.60) : r1(ltp * 0.30),
      strength: score >= 65 ? 'strong' : 'moderate',
    }
  }

  let ce: SideRec | null = null
  let pe: SideRec | null = null

  if (direction === 'bullish') {
    // Bullish → BUY CE (ATM/1 OTM), SELL OTM PE
    if (!isAboveSpot || (stepsFromAtm != null && stepsFromAtm <= step)) {
      if (ceTag === 'LB' || aboveFlip || score >= 68) ce = makeSide('BUY', s.ce_ltp)
    }
    if (isAboveSpot && (peTag === 'SB' || nearPutWall)) {
      pe = makeSide('SELL', s.pe_ltp)
    }
  } else if (direction === 'bearish') {
    // Bearish → BUY PE (ATM/1 OTM), SELL OTM CE
    if (isAboveSpot || (stepsFromAtm != null && stepsFromAtm <= step)) {
      if (peTag === 'LB' || belowFlip || score >= 68) pe = makeSide('BUY', s.pe_ltp)
    }
    if (!isAboveSpot && (ceTag === 'SB' || nearCallWall)) {
      ce = makeSide('SELL', s.ce_ltp)
    }
  }

  return { ce, pe }
}

// ── GEX Profile Chart (SVG) ──────────────────────────────────────────────────

function GexChart({
  strikes,
  spotPrice,
  callWall,
  putWall,
  gammaFlip,
}: {
  strikes: OIEChainStrikeRow[]
  spotPrice: number | null | undefined
  callWall: number | null | undefined
  putWall: number | null | undefined
  gammaFlip: number | null | undefined
}) {
  const CHART_W = 560
  const ROW_H = 14
  const LABEL_W = 56
  const BAR_AREA = (CHART_W - LABEL_W) / 2

  const maxAbs = useMemo(() => {
    const vals = strikes.map(s => Math.abs(s.net_gex ?? 0))
    return Math.max(...vals, 1)
  }, [strikes])

  const h = strikes.length * ROW_H + 20

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${h}`}
      style={{ width: '100%', maxWidth: CHART_W, display: 'block', overflow: 'visible' }}
    >
      <line
        x1={LABEL_W + BAR_AREA} y1={0}
        x2={LABEL_W + BAR_AREA} y2={h}
        stroke="rgba(255,255,255,0.12)" strokeWidth={1}
      />

      {strikes.map((s, i) => {
        const y = i * ROW_H + 4
        const gex = s.net_gex ?? 0
        const barLen = (Math.abs(gex) / maxAbs) * (BAR_AREA - 4)
        const isPos = gex >= 0
        const cx = LABEL_W + BAR_AREA
        const isSpot = spotPrice != null && Math.abs(s.strike_price - spotPrice) < 50
        const isCallWall = s.strike_price === callWall
        const isPutWall = s.strike_price === putWall
        const isFlip = s.strike_price === gammaFlip

        const rowBg = isSpot
          ? 'rgba(120,201,255,0.06)'
          : isCallWall || isPutWall
          ? 'rgba(255,255,255,0.03)'
          : 'transparent'

        return (
          <g key={s.strike_price}>
            <rect x={0} y={y - 2} width={CHART_W} height={ROW_H} fill={rowBg} />
            {barLen > 0 && (
              <rect
                x={isPos ? cx : cx - barLen}
                y={y}
                width={barLen}
                height={ROW_H - 4}
                fill={isPos ? 'rgba(120,201,255,0.55)' : 'rgba(241,66,66,0.55)'}
                rx={1}
              />
            )}
            <text
              x={cx}
              y={y + ROW_H - 5}
              textAnchor="middle"
              fontSize={10}
              fill={isSpot ? 'rgb(120,201,255)' : isFlip ? 'rgb(167,139,250)' : 'rgba(255,255,255,0.45)'}
              fontWeight={isSpot || isFlip ? 600 : 400}
            >
              {s.strike_price}
            </text>
            <text
              x={isPos ? cx + barLen + 3 : cx - barLen - 3}
              y={y + ROW_H - 5}
              textAnchor={isPos ? 'start' : 'end'}
              fontSize={9}
              fill={isPos ? 'rgba(120,201,255,0.6)' : 'rgba(241,66,66,0.6)'}
            >
              {gex !== 0 ? fmtGex(gex) : ''}
            </text>
            {isFlip && (
              <line
                x1={0} y1={y - 1}
                x2={CHART_W} y2={y - 1}
                stroke="rgba(167,139,250,0.4)"
                strokeDasharray="3 3"
                strokeWidth={1}
              />
            )}
          </g>
        )
      })}

      <g transform={`translate(4, ${h - 14})`}>
        <rect x={0} y={0} width={10} height={8} fill="rgba(120,201,255,0.55)" rx={1} />
        <text x={13} y={8} fontSize={9} fill="rgba(255,255,255,0.4)">+GEX (support)</text>
        <rect x={90} y={0} width={10} height={8} fill="rgba(241,66,66,0.55)" rx={1} />
        <text x={103} y={8} fontSize={9} fill="rgba(255,255,255,0.4)">−GEX (resistance)</text>
        {gammaFlip && (
          <>
            <line x1={200} y1={4} x2={213} y2={4} stroke="rgba(167,139,250,0.6)" strokeDasharray="3 2" strokeWidth={1} />
            <text x={216} y={8} fontSize={9} fill="rgba(167,139,250,0.7)">Gamma flip</text>
          </>
        )}
      </g>
    </svg>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const WINDOW = 15

export default function ChainTab({ chain, spotPrice, onTrackPosition, signalReport, intelligence }: Props) {
  const [showAll, setShowAll] = useState(false)
  const [showGreeks, setShowGreeks] = useState(false)
  const [showSignals, setShowSignals] = useState(false)
  const [hoveredStrike, setHoveredStrike] = useState<number | null>(null)

  const direction = signalReport?.composite_direction ?? 'conflicted'
  const score = signalReport?.composite_score ?? 50
  const levels = intelligence?.key_levels ?? null

  const { visibleStrikes, maxCeOI, maxPeOI, gexStrikes } = useMemo(() => {
    if (!chain?.strikes?.length) return { visibleStrikes: [], maxCeOI: 1, maxPeOI: 1, gexStrikes: [] }

    const sorted = [...chain.strikes].sort((a, b) => a.strike_price - b.strike_price)
    const atmIdx = sorted.findIndex(s => s.is_atm)
    const pivot = atmIdx >= 0 ? atmIdx : Math.floor(sorted.length / 2)

    const visible = showAll ? sorted : sorted.slice(
      Math.max(0, pivot - WINDOW),
      Math.min(sorted.length, pivot + WINDOW + 1)
    )
    const gexWindow = sorted.slice(
      Math.max(0, pivot - 12),
      Math.min(sorted.length, pivot + 13)
    ).reverse()

    const maxCeOI = Math.max(...sorted.map(s => s.ce_oi ?? 0), 1)
    const maxPeOI = Math.max(...sorted.map(s => s.pe_oi ?? 0), 1)

    return { visibleStrikes: visible, maxCeOI, maxPeOI, gexStrikes: gexWindow }
  }, [chain, showAll])

  const signalData = useMemo(() => {
    if (!showSignals || !chain?.strikes) return new Map<number, StrikeRec>()
    const spot = spotPrice ?? chain.spot_price ?? null
    const atmStrike = chain.atm_strike ?? null
    const map = new Map<number, StrikeRec>()
    for (const s of chain.strikes) {
      const rec = computeRec(s, direction, score, levels, spot, atmStrike)
      if (rec.ce || rec.pe) map.set(s.strike_price, rec)
    }
    return map
  }, [showSignals, chain, spotPrice, direction, score, levels])

  if (!chain) {
    return <div className="oie-loading">Waiting for chain data…</div>
  }

  const agg = chain.aggregates
  const spot = spotPrice ?? chain.spot_price

  return (
    <div className="chain-root">
      {/* Top stat row */}
      <div className="chain-stats-row">
        <div className="chain-stat">
          <span className="chain-stat-label">Spot</span>
          <span className="chain-stat-value" style={{ color: 'var(--accent)' }}>
            {spot?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) ?? '—'}
          </span>
        </div>
        <div className="chain-stat">
          <span className="chain-stat-label">PCR</span>
          <span className="chain-stat-value" style={{ color: (chain.pcr ?? 0) > 1 ? 'var(--pos)' : 'var(--neg)' }}>
            {chain.pcr?.toFixed(3) ?? '—'}
          </span>
        </div>
        <div className="chain-stat">
          <span className="chain-stat-label">Call Wall</span>
          <span className="chain-stat-value">{agg.call_wall ?? '—'}</span>
        </div>
        <div className="chain-stat">
          <span className="chain-stat-label">Put Wall</span>
          <span className="chain-stat-value">{agg.put_wall ?? '—'}</span>
        </div>
        <div className="chain-stat">
          <span className="chain-stat-label">Gamma Flip</span>
          <span className="chain-stat-value" style={{ color: 'rgb(167,139,250)' }}>
            {agg.gamma_flip_level ?? 'None'}
          </span>
        </div>
        <div className="chain-stat">
          <span className="chain-stat-label">Max Pain</span>
          <span className="chain-stat-value">{chain.max_pain ?? '—'}</span>
        </div>
        <div className="chain-stat">
          <span className="chain-stat-label">Total GEX</span>
          <span className="chain-stat-value" style={{ color: (agg.total_gex ?? 0) > 0 ? 'var(--pos)' : 'var(--neg)' }}>
            {agg.total_gex != null ? `₹${fmtGex(agg.total_gex)}Cr` : '—'}
          </span>
        </div>
        <div className="chain-stat">
          <span className="chain-stat-label">Straddle</span>
          <span className="chain-stat-value">{chain.straddle_price?.toFixed(1) ?? '—'}</span>
        </div>
      </div>

      {/* Signal Banner */}
      {showSignals && (
        <div style={{
          padding: '8px 14px',
          background: direction === 'bullish'
            ? 'rgba(34,197,94,0.07)'
            : direction === 'bearish'
            ? 'rgba(239,68,68,0.07)'
            : 'rgba(148,163,184,0.07)',
          borderBottom: '1px solid var(--hairline)',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
            color: direction === 'bullish' ? 'var(--pos)' : direction === 'bearish' ? 'var(--neg)' : 'var(--fg-faint)',
          }}>
            {direction === 'conflicted' ? '⚠ CONFLICTED' : direction.toUpperCase()}
          </span>
          <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>
            {score}% confidence ·
          </span>
          {direction === 'bullish' && (
            <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>
              Look to <span style={{ color: 'var(--pos)', fontWeight: 600 }}>BUY CE</span> near ATM
              or <span style={{ color: 'rgb(251,146,60)', fontWeight: 600 }}>SELL PE</span> at support
            </span>
          )}
          {direction === 'bearish' && (
            <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>
              Look to <span style={{ color: 'var(--pos)', fontWeight: 600 }}>BUY PE</span> near ATM
              or <span style={{ color: 'rgb(251,146,60)', fontWeight: 600 }}>SELL CE</span> at resistance
            </span>
          )}
          {direction === 'conflicted' && (
            <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>
              Signals mixed — no directional entry suggested. Wait for confirmation.
            </span>
          )}
        </div>
      )}

      {/* GEX Profile */}
      <div className="chain-gex-section">
        <div className="chain-section-title">GEX Profile — Dealer Gamma Exposure per Strike</div>
        <div className="chain-gex-chart">
          <GexChart
            strikes={gexStrikes}
            spotPrice={spot}
            callWall={agg.call_wall}
            putWall={agg.put_wall}
            gammaFlip={agg.gamma_flip_level}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="chain-controls">
        <div className="chain-section-title" style={{ margin: 0 }}>
          Option Chain — {chain.underlying} · {chain.expiry ?? 'Nearest expiry'} · Lot {chain.lot_size}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {onTrackPosition && !showSignals && (
            <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>
              Hover a row to track a position
            </span>
          )}
          <button
            className={`btn-sm${showSignals ? ' active' : ''}`}
            onClick={() => setShowSignals(v => !v)}
            style={{ fontSize: 11, borderColor: showSignals ? (direction === 'bullish' ? 'rgba(34,197,94,0.5)' : direction === 'bearish' ? 'rgba(239,68,68,0.5)' : undefined) : undefined }}
          >
            {showSignals ? '⚡ Signals ON' : '⚡ Signals'}
          </button>
          <button
            className={`btn-sm${showGreeks ? ' active' : ''}`}
            onClick={() => setShowGreeks(v => !v)}
            style={{ fontSize: 11 }}
          >
            Γ Δ Greeks
          </button>
          <button
            className="btn-sm"
            onClick={() => setShowAll(v => !v)}
            style={{ fontSize: 11 }}
          >
            {showAll ? `Show ATM ±${WINDOW}` : `Show all ${chain.strikes.length}`}
          </button>
        </div>
      </div>

      {/* Chain Table */}
      <div className="chain-table-wrap">
        <table className="chain-table">
          <thead>
            <tr>
              {/* CE headers */}
              <th className="chain-th chain-ce-side" style={{ textAlign: 'left' }}>OI</th>
              <th className="chain-th chain-ce-side">ΔOI / Tag</th>
              <th className="chain-th chain-ce-side">Vol</th>
              <th className="chain-th chain-ce-side">IV%</th>
              <th className="chain-th chain-ce-side">LTP</th>
              {showGreeks && <th className="chain-th chain-ce-side">Δ</th>}
              {showGreeks && <th className="chain-th chain-ce-side">GEX</th>}
              {/* Strike */}
              <th className="chain-th chain-strike-col">STRIKE</th>
              {/* PE headers */}
              {showGreeks && <th className="chain-th chain-pe-side">GEX</th>}
              {showGreeks && <th className="chain-th chain-pe-side">Δ</th>}
              <th className="chain-th chain-pe-side">LTP</th>
              <th className="chain-th chain-pe-side">IV%</th>
              <th className="chain-th chain-pe-side">Vol</th>
              <th className="chain-th chain-pe-side">ΔOI / Tag</th>
              <th className="chain-th chain-pe-side" style={{ textAlign: 'right' }}>OI</th>
            </tr>
          </thead>
          <tbody>
            {visibleStrikes.map(s => {
              const isAtm = s.is_atm
              const ceOIPct = s.ce_oi != null ? (s.ce_oi / maxCeOI) * 100 : 0
              const peOIPct = s.pe_oi != null ? (s.pe_oi / maxPeOI) * 100 : 0
              const isCallWall = s.strike_price === agg.call_wall
              const isPutWall = s.strike_price === agg.put_wall
              const isFlip = s.strike_price === agg.gamma_flip_level

              const spotVal = spot ?? 0
              const isAboveSpot = s.strike_price > spotVal
              const ceTag = oiTag(s.ce_oi_change, isAboveSpot, true)
              const peTag = oiTag(s.pe_oi_change, isAboveSpot, false)
              const isHovered = hoveredStrike === s.strike_price
              const rec = showSignals ? (signalData.get(s.strike_price) ?? null) : null

              return (
                <tr
                  key={s.strike_price}
                  className={`chain-row${isAtm ? ' chain-row-atm' : ''}${isCallWall ? ' chain-row-callwall' : ''}${isPutWall ? ' chain-row-putwall' : ''}`}
                  onMouseEnter={() => setHoveredStrike(s.strike_price)}
                  onMouseLeave={() => setHoveredStrike(null)}
                >
                  {/* CE OI with bar */}
                  <td
                    className="chain-td chain-ce-side chain-oi-cell"
                    style={{ background: `linear-gradient(to left, rgba(120,201,255,0.12) ${ceOIPct}%, transparent ${ceOIPct}%)` }}
                  >
                    {fmtOI(s.ce_oi)}
                  </td>

                  {/* CE ΔOI + OI tag */}
                  <td className="chain-td chain-ce-side" style={{ fontSize: 11 }}>
                    <span style={{ color: (s.ce_oi_change ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                      {fmtOIChg(s.ce_oi_change)}
                    </span>
                    {ceTag && (
                      <span
                        title={OI_TAG_TITLE[ceTag]}
                        style={{
                          display: 'block', fontSize: 8, fontWeight: 700, letterSpacing: '0.06em',
                          color: OI_TAG_COLORS[ceTag], marginTop: 1, cursor: 'help',
                        }}
                      >{ceTag}</span>
                    )}
                  </td>

                  {/* CE Volume */}
                  <td className="chain-td chain-ce-side chain-dim">{fmtOI(s.ce_volume)}</td>

                  {/* CE IV */}
                  <td className="chain-td chain-ce-side" style={{ color: 'rgba(251,191,36,0.8)' }}>
                    {fmtIV(s.ce_iv)}
                  </td>

                  {/* CE LTP + Signal + Track button */}
                  <td className="chain-td chain-ce-side chain-ltp">
                    <div className="chain-ltp-wrap">
                      <span>{fmtLTP(s.ce_ltp)}</span>
                      {isHovered && s.ce_ltp != null && onTrackPosition && (
                        <button
                          className="chain-track-btn"
                          onMouseDown={e => {
                            e.stopPropagation()
                            onTrackPosition({
                              strike: s.strike_price,
                              optionType: 'CE',
                              ltp: s.ce_ltp!,
                              underlying: chain.underlying,
                              expiry: chain.expiry ?? null,
                              lotSize: chain.lot_size,
                            })
                          }}
                        >
                          + CE
                        </button>
                      )}
                    </div>
                    {rec?.ce && (
                      <div className={`chain-signal-badge chain-signal-${rec.ce.action.toLowerCase()}`}>
                        <span className="chain-signal-action">{rec.ce.action}</span>
                        <span className="chain-signal-prices">
                          SL {rec.ce.sl} · T {rec.ce.target}
                        </span>
                      </div>
                    )}
                  </td>

                  {/* CE Greeks */}
                  {showGreeks && <td className="chain-td chain-ce-side chain-dim">{fmtDelta(s.ce_delta)}</td>}
                  {showGreeks && <td className="chain-td chain-ce-side chain-dim" style={{ fontSize: 10 }}>{fmtGex(s.ce_gex)}</td>}

                  {/* Strike */}
                  <td className="chain-td chain-strike-col">
                    <span className="chain-strike-label">
                      {s.strike_price}
                      {isAtm && <span className="chain-atm-badge">ATM</span>}
                      {isFlip && <span className="chain-flip-badge">FLIP</span>}
                    </span>
                  </td>

                  {/* PE Greeks */}
                  {showGreeks && <td className="chain-td chain-pe-side chain-dim" style={{ fontSize: 10 }}>{fmtGex(s.pe_gex)}</td>}
                  {showGreeks && <td className="chain-td chain-pe-side chain-dim">{fmtDelta(s.pe_delta)}</td>}

                  {/* PE LTP + Signal + Track button */}
                  <td className="chain-td chain-pe-side chain-ltp">
                    <div className="chain-ltp-wrap">
                      <span>{fmtLTP(s.pe_ltp)}</span>
                      {isHovered && s.pe_ltp != null && onTrackPosition && (
                        <button
                          className="chain-track-btn pe"
                          onMouseDown={e => {
                            e.stopPropagation()
                            onTrackPosition({
                              strike: s.strike_price,
                              optionType: 'PE',
                              ltp: s.pe_ltp!,
                              underlying: chain.underlying,
                              expiry: chain.expiry ?? null,
                              lotSize: chain.lot_size,
                            })
                          }}
                        >
                          + PE
                        </button>
                      )}
                    </div>
                    {rec?.pe && (
                      <div className={`chain-signal-badge chain-signal-${rec.pe.action.toLowerCase()}`}>
                        <span className="chain-signal-action">{rec.pe.action}</span>
                        <span className="chain-signal-prices">
                          SL {rec.pe.sl} · T {rec.pe.target}
                        </span>
                      </div>
                    )}
                  </td>

                  {/* PE IV */}
                  <td className="chain-td chain-pe-side" style={{ color: 'rgba(251,191,36,0.8)' }}>
                    {fmtIV(s.pe_iv)}
                  </td>

                  {/* PE Volume */}
                  <td className="chain-td chain-pe-side chain-dim">{fmtOI(s.pe_volume)}</td>

                  {/* PE ΔOI + OI tag */}
                  <td className="chain-td chain-pe-side" style={{ fontSize: 11 }}>
                    <span style={{ color: (s.pe_oi_change ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                      {fmtOIChg(s.pe_oi_change)}
                    </span>
                    {peTag && (
                      <span
                        title={OI_TAG_TITLE[peTag]}
                        style={{
                          display: 'block', fontSize: 8, fontWeight: 700, letterSpacing: '0.06em',
                          color: OI_TAG_COLORS[peTag], marginTop: 1, cursor: 'help',
                        }}
                      >{peTag}</span>
                    )}
                  </td>

                  {/* PE OI with bar */}
                  <td
                    className="chain-td chain-pe-side chain-oi-cell"
                    style={{
                      textAlign: 'right',
                      background: `linear-gradient(to right, rgba(241,66,66,0.12) ${peOIPct}%, transparent ${peOIPct}%)`,
                    }}
                  >
                    {fmtOI(s.pe_oi)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
