import { useMemo } from 'react'
import type { OptionChainData } from '../../positioning/useOptionChain'

interface Props {
  data: OptionChainData | null
  loading: boolean
}

export default function IVSkewPanel({ data, loading }: Props) {
  const chart = useMemo(() => {
    if (!data?.strikes.length) return null
    const rows = data.strikes.filter(r => r.ce_iv != null || r.pe_iv != null)
    if (!rows.length) return null

    const strikes = rows.map(r => r.strike_price)
    const minS = Math.min(...strikes)
    const maxS = Math.max(...strikes)

    const allIVs = [
      ...rows.map(r => r.ce_iv ?? 0),
      ...rows.map(r => r.pe_iv ?? 0),
    ].filter(v => v > 0)
    if (!allIVs.length) return null

    const maxIV = Math.max(...allIVs)
    const minIV = Math.max(0, Math.min(...allIVs) - 2)

    return { rows, minS, maxS, maxIV, minIV, atmStrike: data.atm_strike }
  }, [data?.strikes, data?.atm_strike])

  const W = 500, H = 230
  const PAD = { top: 18, right: 18, bottom: 38, left: 46 }
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  if (!chart) {
    return (
      <div className="options-panel-empty">
        {loading ? 'Loading IV data…' : 'IV data not available — option chain required.'}
      </div>
    )
  }

  const { rows, minS, maxS, maxIV, minIV, atmStrike } = chart
  const rangeS = maxS - minS || 1
  const rangeIV = maxIV - minIV || 1

  const xOf = (s: number) => PAD.left + ((s - minS) / rangeS) * plotW
  const yOf = (iv: number) => PAD.top + plotH - ((iv - minIV) / rangeIV) * plotH

  const ceRows = rows.filter(r => r.ce_iv != null)
  const peRows = rows.filter(r => r.pe_iv != null)
  const cePts = ceRows.map(r => `${xOf(r.strike_price).toFixed(1)},${yOf(r.ce_iv!).toFixed(1)}`).join(' ')
  const pePts = peRows.map(r => `${xOf(r.strike_price).toFixed(1)},${yOf(r.pe_iv!).toFixed(1)}`).join(' ')

  const yTicks = [0, 1, 2, 3, 4].map(i => minIV + (rangeIV * i) / 4)
  const xStep = Math.max(1, Math.ceil(rows.length / 6))
  const xLabels = rows.filter((_, i) => i % xStep === 0 || i === rows.length - 1)
  const atmX = atmStrike != null ? xOf(atmStrike) : null

  return (
    <div className="iv-skew-wrap">
      <div className="iv-skew-legend">
        <span className="iv-skew-item iv-skew-ce-dot">CE IV</span>
        <span className="iv-skew-item iv-skew-pe-dot">PE IV</span>
        {atmStrike != null && (
          <span className="iv-skew-item iv-skew-atm-dot">ATM {atmStrike}</span>
        )}
        <span className="iv-skew-note">Implied Volatility across strikes</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="iv-skew-svg" preserveAspectRatio="xMidYMid meet">
        {/* Horizontal grid + Y labels */}
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={yOf(tick).toFixed(1)} x2={W - PAD.right} y2={yOf(tick).toFixed(1)}
              stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
            <text x={PAD.left - 5} y={(yOf(tick) + 3.5).toFixed(1)}
              fontSize={9} fill="var(--text-3)" textAnchor="end">
              {tick.toFixed(1)}%
            </text>
          </g>
        ))}

        {/* ATM vertical dashed line */}
        {atmX != null && (
          <>
            <line x1={atmX.toFixed(1)} y1={PAD.top} x2={atmX.toFixed(1)} y2={H - PAD.bottom}
              stroke="rgba(234,179,8,0.4)" strokeWidth={1} strokeDasharray="4,3" />
            <text x={atmX.toFixed(1)} y={PAD.top - 4}
              fontSize={8} fill="rgba(234,179,8,0.6)" textAnchor="middle">ATM</text>
          </>
        )}

        {/* CE IV area fill */}
        {cePts && ceRows.length > 1 && (
          <polygon
            points={`${xOf(ceRows[0].strike_price).toFixed(1)},${(H - PAD.bottom).toFixed(1)} ${cePts} ${xOf(ceRows[ceRows.length - 1].strike_price).toFixed(1)},${(H - PAD.bottom).toFixed(1)}`}
            fill="rgba(239,68,68,0.06)"
          />
        )}
        {/* PE IV area fill */}
        {pePts && peRows.length > 1 && (
          <polygon
            points={`${xOf(peRows[0].strike_price).toFixed(1)},${(H - PAD.bottom).toFixed(1)} ${pePts} ${xOf(peRows[peRows.length - 1].strike_price).toFixed(1)},${(H - PAD.bottom).toFixed(1)}`}
            fill="rgba(34,197,94,0.06)"
          />
        )}

        {/* Lines */}
        {cePts && <polyline points={cePts} fill="none" stroke="rgba(239,68,68,0.85)" strokeWidth={1.5} strokeLinejoin="round" />}
        {pePts && <polyline points={pePts} fill="none" stroke="rgba(34,197,94,0.85)" strokeWidth={1.5} strokeLinejoin="round" />}

        {/* Dots */}
        {rows.map(r => (
          <g key={r.strike_price}>
            {r.ce_iv != null && (
              <circle cx={xOf(r.strike_price).toFixed(1)} cy={yOf(r.ce_iv).toFixed(1)} r={2.5}
                fill="rgba(239,68,68,0.9)" />
            )}
            {r.pe_iv != null && (
              <circle cx={xOf(r.strike_price).toFixed(1)} cy={yOf(r.pe_iv).toFixed(1)} r={2.5}
                fill="rgba(34,197,94,0.9)" />
            )}
          </g>
        ))}

        {/* X axis labels */}
        {xLabels.map(r => (
          <text key={r.strike_price} x={xOf(r.strike_price).toFixed(1)} y={H - PAD.bottom + 14}
            fontSize={9} fill="var(--text-3)" textAnchor="middle">
            {r.strike_price}
          </text>
        ))}

        {/* Axes */}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={H - PAD.bottom}
          stroke="rgba(255,255,255,0.15)" strokeWidth={0.5} />
        <line x1={PAD.left} y1={H - PAD.bottom} x2={W - PAD.right} y2={H - PAD.bottom}
          stroke="rgba(255,255,255,0.15)" strokeWidth={0.5} />
      </svg>
    </div>
  )
}
