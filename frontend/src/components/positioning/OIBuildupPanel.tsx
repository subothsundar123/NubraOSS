import type { OptionChainData } from '../../positioning/useOptionChain'

interface Props {
  data: OptionChainData | null
  loading: boolean
}

function fmtOI(v: number | null | undefined): string {
  if (v == null) return '--'
  const abs = Math.abs(v)
  if (abs >= 1_00_00_000) return `${(v / 1_00_00_000).toFixed(1)}Cr`
  if (abs >= 1_00_000) return `${(v / 1_00_000).toFixed(1)}L`
  if (abs >= 1_000) return `${(v / 1_000).toFixed(0)}K`
  return String(Math.round(v))
}

export default function OIBuildupPanel({ data, loading }: Props) {
  if (!data?.strikes.length) {
    return (
      <div className="options-panel-empty">
        {loading ? 'Loading OI data…' : 'No OI data available.'}
      </div>
    )
  }

  const strikes = data.strikes
  const maxOI = Math.max(...strikes.map(s => Math.max(s.ce_oi ?? 0, s.pe_oi ?? 0)), 1)

  return (
    <div className="oi-buildup-wrap">
      <div className="oi-buildup-header">
        <span className="oi-buildup-hdr-ce">CE OI</span>
        <span className="oi-buildup-hdr-strike">Strike</span>
        <span className="oi-buildup-hdr-pe">PE OI</span>
      </div>
      <div className="oi-buildup-rows">
        {strikes.map(row => {
          const ceW = ((row.ce_oi ?? 0) / maxOI) * 100
          const peW = ((row.pe_oi ?? 0) / maxOI) * 100
          const ceChg = row.ce_oi_change ?? 0
          const peChg = row.pe_oi_change ?? 0
          return (
            <div key={row.strike_price} className={`oi-buildup-row${row.is_atm ? ' oi-buildup-atm' : ''}`}>
              {/* CE side */}
              <div className="oi-buildup-ce-cell">
                <div className="oi-buildup-bar-track ce">
                  <div className="oi-buildup-bar ce" style={{ width: `${ceW}%` }} />
                </div>
                <span className="oi-buildup-val">{fmtOI(row.ce_oi)}</span>
                {ceChg !== 0 && (
                  <span className={`oi-buildup-chg ${ceChg > 0 ? 'pos' : 'neg'}`}>
                    {ceChg > 0 ? '+' : ''}{fmtOI(ceChg)}
                  </span>
                )}
              </div>
              {/* Strike */}
              <div className="oi-buildup-strike-cell">
                <span className="oi-buildup-strike-num">{row.strike_price}</span>
                {row.is_atm && <span className="oi-atm-badge">ATM</span>}
              </div>
              {/* PE side */}
              <div className="oi-buildup-pe-cell">
                {peChg !== 0 && (
                  <span className={`oi-buildup-chg ${peChg > 0 ? 'pos' : 'neg'}`}>
                    {peChg > 0 ? '+' : ''}{fmtOI(peChg)}
                  </span>
                )}
                <span className="oi-buildup-val">{fmtOI(row.pe_oi)}</span>
                <div className="oi-buildup-bar-track pe">
                  <div className="oi-buildup-bar pe" style={{ width: `${peW}%` }} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
