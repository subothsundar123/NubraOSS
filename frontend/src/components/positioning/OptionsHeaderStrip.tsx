import type { OptionChainData } from '../../positioning/useOptionChain'
import InfoTip from '../InfoTip'
import { SignalChip } from '../dashboard/MetricTile'

interface OptionsHeaderStripProps {
  data: OptionChainData | null
  latestPrice: number | null
  loading: boolean
  isStale?: boolean
}

function fmt(v: number | null | undefined, decimals = 2): string {
  if (v == null || Number.isNaN(v)) return '--'
  return v.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtOI(v: number | null | undefined): string {
  if (v == null) return '--'
  if (v >= 1_00_00_000) return `${(v / 1_00_00_000).toFixed(2)}Cr`
  if (v >= 1_00_000) return `${(v / 1_00_000).toFixed(1)}L`
  return v.toLocaleString('en-IN')
}

function pcrLabel(pcr: number | null): string {
  if (pcr == null) return '--'
  if (pcr > 1.2) return 'Bullish'
  if (pcr < 0.8) return 'Bearish'
  return 'Neutral'
}

function pcrTone(pcr: number | null): 'positive' | 'negative' | 'neutral' {
  if (pcr == null) return 'neutral'
  if (pcr > 1.2) return 'positive'
  if (pcr < 0.8) return 'negative'
  return 'neutral'
}

export default function OptionsHeaderStrip({ data, latestPrice, loading, isStale }: OptionsHeaderStripProps) {
  const spot = latestPrice ?? data?.spot_price ?? null
  const pcr = data?.pcr ?? null

  return (
    <div className="options-header-strip">
      <div className="options-header-cell">
        <span>NIFTY Spot</span>
        <strong className="options-spot">{fmt(spot, 2)}</strong>
        <small>{loading ? 'Loading...' : isStale ? 'Last session' : data ? 'Live' : spot ? 'Last session' : 'Awaiting data'}</small>
      </div>
      <div className="options-header-cell">
        <span>ATM Strike</span>
        <strong>{data?.atm_strike ?? '--'}</strong>
        <small>Nearest strike</small>
      </div>
      <div className="options-header-cell">
        <span>PCR <InfoTip term="options_pressure" /></span>
        <strong>{pcr != null ? pcr.toFixed(3) : '--'}</strong>
        <SignalChip tone={pcrTone(pcr)}>{pcrLabel(pcr)}</SignalChip>
      </div>
      <div className="options-header-cell">
        <span>ATM Straddle</span>
        <strong>₹{fmt(data?.straddle_price)}</strong>
        <small>{data?.expiry ?? '--'}</small>
      </div>
      <div className="options-header-cell">
        <span>Max Pain</span>
        <strong>{data?.max_pain ?? '--'}</strong>
        <small>{data?.max_pain && spot ? `${(data.max_pain - spot).toFixed(0)} from spot` : '--'}</small>
      </div>
      <div className="options-header-cell">
        <span>Total CE OI</span>
        <strong className="neg-text">{fmtOI(data?.total_ce_oi)}</strong>
        <small>Calls outstanding</small>
      </div>
      <div className="options-header-cell">
        <span>Total PE OI</span>
        <strong className="pos-text">{fmtOI(data?.total_pe_oi)}</strong>
        <small>Puts outstanding</small>
      </div>
    </div>
  )
}
