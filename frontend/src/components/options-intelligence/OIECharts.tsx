import type { OIEChainStrikeRow } from './useOIEData'

// ── PCR Gauge ─────────────────────────────────────────────────────────────────
// Semicircle: PCR 1.5=180° (left, fear) → PCR 0.5=0° (right, greed)
// Geometry: cx=190, cy=168, R=120, rInner=74
// Zone arc endpoints (pre-calculated):
//   180°→(70,168)  144°→(93,97)  108°→(153,54)  72°→(227,54)  36°→(287,97)  0°→(310,168)
//   inner 180°→(116,168)  144°→(130,125)  108°→(167,98)  72°→(213,98)  36°→(250,125)  0°→(264,168)
export function PCRGauge({ pcr }: { pcr: number | null }) {
  if (pcr == null) {
    return <div className="oie-chart-empty">PCR unavailable</div>
  }

  const cx = 190, cy = 168, rNeedle = 110
  const clamped = Math.min(1.55, Math.max(0.45, pcr))
  const rad = ((clamped - 0.5) / 1.0) * Math.PI
  const nx = Math.round(cx + rNeedle * Math.cos(rad))
  const ny = Math.round(cy - rNeedle * Math.sin(rad))

  const pcrColor =
    pcr > 1.2 ? '#86EFAC' :
    pcr > 0.8 ? '#6FD1D7' :
    '#FCA5A5'

  const pcrLabel =
    pcr > 1.5 ? 'Extreme Fear' :
    pcr > 1.2 ? 'Bearish' :
    pcr > 0.8 ? 'Neutral' :
    pcr > 0.5 ? 'Bullish' :
    'Extreme Greed'

  return (
    <svg viewBox="-90 0 560 214" style={{ width: '100%', height: 'auto' }}>
      {/* Zone arcs */}
      <path d="M 70 168 A 120 120 0 0 0 93 97 L 130 125 A 74 74 0 0 1 116 168 Z" fill="#16A34A" opacity={0.85} />
      <path d="M 93 97 A 120 120 0 0 0 153 54 L 167 98 A 74 74 0 0 1 130 125 Z" fill="#65A30D" opacity={0.75} />
      <path d="M 153 54 A 120 120 0 0 0 227 54 L 213 98 A 74 74 0 0 1 167 98 Z" fill="#6FD1D7" opacity={0.75} />
      <path d="M 227 54 A 120 120 0 0 0 287 97 L 250 125 A 74 74 0 0 1 213 98 Z" fill="#CA8A04" opacity={0.70} />
      <path d="M 287 97 A 120 120 0 0 0 310 168 L 264 168 A 74 74 0 0 1 250 125 Z" fill="#DC2626" opacity={0.80} />
      {/* Arc outlines */}
      <path d="M 70 168 A 120 120 0 0 0 310 168" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth={1} />
      <path d="M 116 168 A 74 74 0 0 0 264 168" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth={1} />
      {/* Scale labels */}
      <text x={58} y={184} fontSize={8} fill="rgba(255,255,255,.4)" textAnchor="middle">1.5+</text>
      <text x={190} y={44} fontSize={8} fill="rgba(255,255,255,.35)" textAnchor="middle">1.0</text>
      <text x={322} y={184} fontSize={8} fill="rgba(255,255,255,.4)" textAnchor="middle">0.5–</text>
      {/* Zone labels */}
      <text x={95} y={144} fontSize={7} fill="rgba(255,255,255,.8)" textAnchor="middle" fontWeight={700}>FEAR</text>
      <text x={190} y={74} fontSize={7} fill="rgba(255,255,255,.8)" textAnchor="middle" fontWeight={700}>NEUTRAL</text>
      <text x={285} y={144} fontSize={7} fill="rgba(255,255,255,.8)" textAnchor="middle" fontWeight={700}>GREED</text>
      {/* Needle */}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="white" strokeWidth={2.5} strokeLinecap="round" opacity={0.9} />
      <circle cx={cx} cy={cy} r={6} fill="white" opacity={0.9} />
      <circle cx={cx} cy={cy} r={2.5} fill="#060f1c" />
      {/* PCR value */}
      <text x={cx} y={cy + 26} fontSize={18} fill={pcrColor} fontWeight={800} textAnchor="middle">{pcr.toFixed(2)}</text>
      <text x={cx} y={cy + 41} fontSize={9} fill="rgba(255,255,255,.4)" textAnchor="middle">{pcrLabel}</text>
    </svg>
  )
}

// ── Key Levels Chart ─────────────────────────────────────────────────────────
interface KeyLevelsDef {
  call_wall: number | null
  put_wall: number | null
  gamma_flip: number | null
  max_pain: number | null
  spot: number | null
}

export function KeyLevelsChart({ levels }: { levels: KeyLevelsDef }) {
  const defs = [
    { v: levels.call_wall, label: 'Call Wall', color: '#EF4444', dash: undefined },
    { v: levels.spot,      label: 'Spot',      color: 'rgba(255,255,255,.85)', dash: undefined },
    { v: levels.gamma_flip, label: 'γ Flip',   color: '#6FD1D7', dash: '5 3' },
    { v: levels.max_pain,  label: 'Max Pain',  color: '#F59E0B', dash: '3 3' },
    { v: levels.put_wall,  label: 'Put Wall',  color: '#22C55E', dash: undefined },
  ].filter((e): e is { v: number; label: string; color: string; dash: string | undefined } => e.v != null)

  if (defs.length < 2) {
    return <div className="oie-chart-empty">Key levels unavailable</div>
  }

  const vals = defs.map(e => e.v)
  const minV = Math.min(...vals)
  const maxV = Math.max(...vals)
  const range = maxV - minV || 100
  const pad = range * 0.2

  const svgH = 200, xAxis = 140, xEnd = 420, mt = 14, mb = 14
  const usableH = svgH - mt - mb
  const yOf = (v: number) => mt + ((maxV + pad - v) / (range + 2 * pad)) * usableH

  return (
    <svg viewBox="-10 0 560 200" style={{ width: '100%', height: 'auto' }}>
      <line x1={xAxis} y1={mt - 5} x2={xAxis} y2={svgH - mb + 5}
            stroke="rgba(255,255,255,.1)" strokeWidth={1} />

      {defs.map(({ v, label, color, dash }) => {
        const y = yOf(v)
        const isSpot = label === 'Spot'
        return (
          <g key={label}>
            <line x1={xAxis} y1={y} x2={xEnd} y2={y}
                  stroke={color} strokeWidth={isSpot ? 2 : 1.5} strokeDasharray={dash} />
            <text x={xAxis - 6} y={y + 4} fontSize={8.5} fill="rgba(255,255,255,.3)" textAnchor="end">
              {v.toLocaleString('en-IN')}
            </text>
            <text x={xEnd + 6} y={y + 4} fontSize={8.5} fill={color}
                  textAnchor="start" fontWeight={isSpot ? 700 : 400}>
              {label}
            </text>
            {isSpot && <circle cx={xAxis} cy={y} r={4} fill={color} />}
          </g>
        )
      })}
    </svg>
  )
}

// ── GEX Profile Chart ─────────────────────────────────────────────────────────
export function GEXProfileChart({
  strikes,
  gammaFlipLevel,
}: {
  strikes: OIEChainStrikeRow[]
  gammaFlipLevel: number | null
}) {
  const valid = strikes.filter(s => s.net_gex != null)
  if (valid.length === 0) return null

  // Sort descending (high price at top, matching standard option chain layout)
  const sorted = [...valid].sort((a, b) => b.strike_price - a.strike_price)
  const atmIdx = sorted.findIndex(s => s.is_atm)
  const center = atmIdx >= 0 ? atmIdx : Math.floor(sorted.length / 2)
  const visible = sorted.slice(Math.max(0, center - 6), Math.min(sorted.length, center + 7))
  if (visible.length === 0) return null

  const maxAbs = Math.max(...visible.map(s => Math.abs(s.net_gex!)), 1)

  const ROW = 28, GAP = 4, MTOP = 26, cx = 265, maxBarW = 178
  const svgH = MTOP + visible.length * (ROW + GAP) + 20

  return (
    <svg viewBox={`0 0 530 ${svgH}`} style={{ width: '100%', height: 'auto' }}>
      {/* Column headers */}
      <text x={cx - 90} y={16} fontSize={8.5} fill="rgba(239,68,68,.7)" textAnchor="middle" fontWeight={700}>
        — GEX  (volatile)
      </text>
      <text x={cx + 90} y={16} fontSize={8.5} fill="rgba(34,197,94,.7)" textAnchor="middle" fontWeight={700}>
        + GEX  (stable)
      </text>
      {/* Centre axis — the ±GEX separator */}
      <line x1={cx} y1={20} x2={cx} y2={svgH - 12}
            stroke="rgba(111,209,215,.4)" strokeWidth={1.5} strokeDasharray="4 3" />

      {visible.map((s, i) => {
        const y = MTOP + i * (ROW + GAP)
        const gex = s.net_gex!
        const barW = (Math.abs(gex) / maxAbs) * maxBarW
        const barX = gex >= 0 ? cx : cx - barW
        const barColor = gex >= 0 ? 'rgba(34,197,94,.55)' : 'rgba(239,68,68,.55)'
        const isGF = gammaFlipLevel != null &&
                     Math.abs(s.strike_price - gammaFlipLevel) < 26

        return (
          <g key={s.strike_price}>
            {/* ATM row highlight */}
            {s.is_atm && (
              <rect x={22} y={y - 3} width={486} height={ROW + 6} rx={3}
                    fill="rgba(111,209,215,.05)" stroke="rgba(111,209,215,.2)" strokeWidth={1} />
            )}
            {/* Gamma flip row marker */}
            {isGF && !s.is_atm && (
              <rect x={22} y={y - 3} width={486} height={ROW + 6} rx={3}
                    fill="none" stroke="rgba(111,209,215,.35)" strokeWidth={1} strokeDasharray="4 2" />
            )}
            {/* GEX bar (drawn before label so label is on top) */}
            <rect x={barX} y={y + 4} width={Math.max(barW, 2)} height={ROW - 8} rx={2} fill={barColor} />
            {/* Strike label on top of bar */}
            <text x={cx} y={y + ROW / 2 + 4} fontSize={9.5}
                  fill={s.is_atm ? '#6FD1D7' : 'rgba(255,255,255,.72)'}
                  fontWeight={s.is_atm ? 800 : 500} textAnchor="middle">
              {s.strike_price}
            </text>
          </g>
        )
      })}

      <text x={cx} y={svgH - 2} fontSize={7.5} fill="rgba(111,209,215,.6)" textAnchor="middle">
        γ SPINE
      </text>
    </svg>
  )
}

// ── IV Skew Chart ─────────────────────────────────────────────────────────────
export function IVSkewChart({
  strikes,
  atm,
}: {
  strikes: OIEChainStrikeRow[]
  atm: number | null
}) {
  const withIv = strikes.filter(s => s.ce_iv != null || s.pe_iv != null)
  if (withIv.length === 0) return null

  const sorted = [...withIv].sort((a, b) => a.strike_price - b.strike_price)
  const atmI0 = atm != null
    ? sorted.reduce((bi, s, i) =>
        Math.abs(s.strike_price - atm) < Math.abs(sorted[bi].strike_price - atm) ? i : bi, 0)
    : Math.floor(sorted.length / 2)
  const visible = sorted.slice(Math.max(0, atmI0 - 7), Math.min(sorted.length, atmI0 + 8))
  if (visible.length < 3) return null

  const svgW = 530, svgH = 188
  const ml = 38, mr = 16, mt = 18, mb = 26
  const cW = svgW - ml - mr, cH = svgH - mt - mb

  const allIvs = visible.flatMap(s => [s.ce_iv, s.pe_iv].filter((v): v is number => v != null))
  const minIv = Math.min(...allIvs)
  const maxIv = Math.max(...allIvs)
  const ivR = maxIv - minIv || 1
  const ivPad = ivR * 0.12

  const xOf = (i: number) => ml + (i / Math.max(visible.length - 1, 1)) * cW
  const yOf = (iv: number) => mt + ((maxIv + ivPad - iv) / (ivR + 2 * ivPad)) * cH

  const buildLine = (getter: (s: OIEChainStrikeRow) => number | null | undefined) => {
    const cmds: string[] = []
    visible.forEach((s, i) => {
      const v = getter(s)
      if (v == null) return
      cmds.push(`${cmds.length === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${yOf(v).toFixed(1)}`)
    })
    return cmds.join(' ')
  }

  const peLine = buildLine(s => s.pe_iv)
  const ceLine = buildLine(s => s.ce_iv)

  const atmIdx = visible.findIndex(s => s.is_atm)
  const gridFs = [0.2, 0.5, 0.8]

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: '100%', height: 'auto' }}>
      <defs>
        <linearGradient id="oieIvBg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#EF4444" stopOpacity={0.06} />
          <stop offset="50%" stopColor="#6FD1D7" stopOpacity={0.03} />
          <stop offset="100%" stopColor="#22C55E" stopOpacity={0.05} />
        </linearGradient>
      </defs>

      <rect x={ml} y={mt} width={cW} height={cH} fill="url(#oieIvBg)" rx={3} />

      {/* Grid lines + Y labels */}
      {gridFs.map(f => {
        const y = mt + f * cH
        const iv = (maxIv + ivPad) - f * (ivR + 2 * ivPad)
        return (
          <g key={f}>
            <line x1={ml} y1={y} x2={ml + cW} y2={y} stroke="rgba(255,255,255,.06)" strokeWidth={1} />
            <text x={ml - 4} y={y + 4} fontSize={7.5} fill="rgba(255,255,255,.25)" textAnchor="end">
              {iv.toFixed(0)}%
            </text>
          </g>
        )
      })}

      {/* ATM vertical */}
      {atmIdx >= 0 && (
        <line x1={xOf(atmIdx)} y1={mt} x2={xOf(atmIdx)} y2={mt + cH}
              stroke="rgba(111,209,215,.3)" strokeWidth={1} strokeDasharray="3 3" />
      )}

      {/* PE IV line (red) */}
      {peLine && (
        <path d={peLine} fill="none" stroke="#EF4444" strokeWidth={1.8}
              strokeLinecap="round" strokeLinejoin="round" opacity={0.8} />
      )}
      {/* CE IV line (green) */}
      {ceLine && (
        <path d={ceLine} fill="none" stroke="#22C55E" strokeWidth={1.8}
              strokeLinecap="round" strokeLinejoin="round" opacity={0.8} />
      )}

      {/* Axes */}
      <line x1={ml} y1={mt + cH} x2={ml + cW} y2={mt + cH} stroke="rgba(255,255,255,.1)" strokeWidth={1} />
      <line x1={ml} y1={mt} x2={ml} y2={mt + cH} stroke="rgba(255,255,255,.1)" strokeWidth={1} />

      {/* X-axis strike labels */}
      {visible.map((s, i) => {
        if (i % 3 !== 0 && i !== visible.length - 1) return null
        return (
          <text key={s.strike_price} x={xOf(i)} y={svgH - 8} fontSize={7.5}
                fill="rgba(255,255,255,.28)" textAnchor="middle">
            {s.strike_price}
          </text>
        )
      })}

      {/* Legend */}
      <circle cx={ml + 10} cy={mt - 5} r={3} fill="#EF4444" opacity={0.8} />
      <text x={ml + 17} y={mt - 1} fontSize={8} fill="rgba(252,165,165,.7)">PE IV</text>
      <circle cx={ml + 54} cy={mt - 5} r={3} fill="#22C55E" opacity={0.8} />
      <text x={ml + 61} y={mt - 1} fontSize={8} fill="rgba(134,239,172,.7)">CE IV</text>
    </svg>
  )
}
