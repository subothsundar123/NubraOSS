import type { OptionChainData } from '../../positioning/useOptionChain'

interface Props {
  data: OptionChainData | null
  loading: boolean
}

function fmtOI(v: number | null | undefined): string {
  if (v == null) return '--'
  if (v >= 1_00_00_000) return `${(v / 1_00_00_000).toFixed(2)}Cr`
  if (v >= 1_00_000) return `${(v / 1_00_000).toFixed(1)}L`
  return v.toLocaleString('en-IN')
}

function pcrSentiment(pcr: number | null): { label: string; tone: string } {
  if (pcr == null) return { label: 'No data', tone: 'neutral' }
  if (pcr >= 1.5) return { label: 'Strongly Bullish', tone: 'bullish' }
  if (pcr >= 1.2) return { label: 'Bullish', tone: 'bullish' }
  if (pcr >= 0.8) return { label: 'Neutral', tone: 'neutral' }
  if (pcr >= 0.5) return { label: 'Bearish', tone: 'bearish' }
  return { label: 'Strongly Bearish', tone: 'bearish' }
}

function PCRGauge({ pcr }: { pcr: number | null }) {
  const W = 280, H = 150
  const cx = W / 2, cy = H - 16
  const R = 105

  // Map PCR 0–2 → angle 0°–180° on the semicircle
  // 0 = leftmost (fully bearish), 2 = rightmost (fully bullish)
  const pcrClamped = Math.min(Math.max(pcr ?? 1, 0), 2)
  const angleDeg = (pcrClamped / 2) * 180
  const angleRad = ((angleDeg - 180) * Math.PI) / 180
  const needleX = cx + (R - 18) * Math.cos(angleRad)
  const needleY = cy + (R - 18) * Math.sin(angleRad)

  const arcPath = (fromDeg: number, toDeg: number, r: number) => {
    const a1 = ((fromDeg - 180) * Math.PI) / 180
    const a2 = ((toDeg - 180) * Math.PI) / 180
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1)
    const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2)
    const large = toDeg - fromDeg > 180 ? 1 : 0
    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="pcr-gauge-svg">
      {/* Track */}
      <path d={arcPath(0, 180, R - 9)} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={18} strokeLinecap="round" />
      {/* Segments */}
      <path d={arcPath(0, 60, R - 9)} fill="none" stroke="rgba(239,68,68,0.55)" strokeWidth={14} />
      <path d={arcPath(60, 90, R - 9)} fill="none" stroke="rgba(239,68,68,0.25)" strokeWidth={14} />
      <path d={arcPath(90, 110, R - 9)} fill="none" stroke="rgba(234,179,8,0.45)" strokeWidth={14} />
      <path d={arcPath(110, 130, R - 9)} fill="none" stroke="rgba(34,197,94,0.25)" strokeWidth={14} />
      <path d={arcPath(130, 180, R - 9)} fill="none" stroke="rgba(34,197,94,0.55)" strokeWidth={14} />
      {/* Tick at neutral (1.0 = 90°) */}
      <line
        x1={cx + (R - 20) * Math.cos(((90 - 180) * Math.PI) / 180)}
        y1={cy + (R - 20) * Math.sin(((90 - 180) * Math.PI) / 180)}
        x2={cx + (R + 2) * Math.cos(((90 - 180) * Math.PI) / 180)}
        y2={cy + (R + 2) * Math.sin(((90 - 180) * Math.PI) / 180)}
        stroke="rgba(234,179,8,0.6)" strokeWidth={1.5}
      />
      {/* Needle */}
      {pcr != null && (
        <>
          <line x1={cx} y1={cy} x2={needleX.toFixed(1)} y2={needleY.toFixed(1)}
            stroke="rgba(255,255,255,0.9)" strokeWidth={2} strokeLinecap="round" />
          <circle cx={cx} cy={cy} r={4.5} fill="var(--surface-2)" stroke="rgba(255,255,255,0.5)" strokeWidth={1} />
        </>
      )}
      {/* Labels */}
      <text x={10} y={H - 2} fill="rgba(239,68,68,0.7)" fontSize={9} fontWeight="600">Bearish</text>
      <text x={W - 10} y={H - 2} fill="rgba(34,197,94,0.7)" fontSize={9} fontWeight="600" textAnchor="end">Bullish</text>
      <text x={cx} y={cy - R + 6} fill="rgba(234,179,8,0.6)" fontSize={9} textAnchor="middle">1.0</text>
    </svg>
  )
}

export default function PCRPanel({ data, loading }: Props) {
  const pcr = data?.pcr ?? null
  const { label, tone } = pcrSentiment(pcr)
  const ceOI = data?.total_ce_oi ?? null
  const peOI = data?.total_pe_oi ?? null
  const total = (ceOI ?? 0) + (peOI ?? 0)
  const cePct = total > 0 ? ((ceOI ?? 0) / total) * 100 : 50
  const pePct = 100 - cePct

  return (
    <div className="pcr-panel">
      {/* Gauge */}
      <div className="pcr-gauge-wrap">
        <PCRGauge pcr={pcr} />
        <div className="pcr-value-block">
          <span className="pcr-big">{pcr != null ? pcr.toFixed(3) : '--'}</span>
          <span className={`pcr-sentiment pcr-sent-${tone}`}>{label}</span>
        </div>
      </div>

      {/* CE vs PE tug-of-war bar */}
      <div className="pcr-oi-section">
        <div className="pcr-oi-labels">
          <span className="pcr-oi-label-ce">CE (Calls) {fmtOI(ceOI)}</span>
          <span className="pcr-oi-label-pe">PE (Puts) {fmtOI(peOI)}</span>
        </div>
        <div className="pcr-oi-bar">
          <div className="pcr-oi-bar-ce" style={{ width: `${cePct}%` }} />
          <div className="pcr-oi-bar-pe" style={{ width: `${pePct}%` }} />
        </div>
        <p className="pcr-oi-note">
          Higher PE OI → more puts written → writers expect support → bullish bias
        </p>
      </div>

      {/* Key levels */}
      <div className="pcr-stats-row">
        <div className="pcr-stat">
          <span className="pcr-stat-label">ATM Strike</span>
          <span className="pcr-stat-val">{data?.atm_strike ?? '--'}</span>
        </div>
        <div className="pcr-stat">
          <span className="pcr-stat-label">Max Pain</span>
          <span className="pcr-stat-val">{data?.max_pain ?? '--'}</span>
        </div>
        <div className="pcr-stat">
          <span className="pcr-stat-label">ATM Straddle</span>
          <span className="pcr-stat-val">{data?.straddle_price != null ? `₹${data.straddle_price.toFixed(0)}` : '--'}</span>
        </div>
        <div className="pcr-stat">
          <span className="pcr-stat-label">Expiry</span>
          <span className="pcr-stat-val">{data?.expiry ?? '--'}</span>
        </div>
      </div>
    </div>
  )
}
