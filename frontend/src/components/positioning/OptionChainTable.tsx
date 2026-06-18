import type { OptionChainData, OptionChainStrikeRow } from '../../positioning/useOptionChain'

export interface SelectedOption {
  strike: number
  optionType: 'CE' | 'PE'
  ltp: number | null
  expiry: string | null
  underlying: string
  ref_id: number | null
}

interface OptionChainTableProps {
  data: OptionChainData | null
  loading: boolean
  error: string
  isStale?: boolean
  selectedStrike?: number | null
  selectedType?: 'CE' | 'PE' | null
  onSelectOption?: (opt: SelectedOption) => void
  onRetry?: () => void
}

function fmt(v: number | null | undefined, decimals = 0): string {
  if (v == null || Number.isNaN(v)) return '--'
  return v.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtOI(v: number | null | undefined): string {
  if (v == null) return '--'
  if (v >= 1_00_00_000) return `${(v / 1_00_00_000).toFixed(1)}Cr`
  if (v >= 1_00_000) return `${(v / 1_00_000).toFixed(1)}L`
  return v.toLocaleString('en-IN')
}

function fmtOIChange(v: number | null | undefined): { text: string; cls: string } {
  if (v == null) return { text: '--', cls: '' }
  const text = (v >= 0 ? '+' : '') + fmtOI(v)
  return { text, cls: v > 0 ? 'pos-text' : v < 0 ? 'neg-text' : '' }
}

function OIBar({ value, max, side }: { value: number | null; max: number; side: 'ce' | 'pe' }) {
  if (!value || !max) return <div className="oi-bar-wrap" />
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div className="oi-bar-wrap">
      <div
        className={`oi-bar oi-bar-${side}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function StrikeRow({
  row,
  maxOI,
  selectedStrike,
  selectedType,
  onSelect,
  underlying,
  expiry,
}: {
  row: OptionChainStrikeRow
  maxOI: number
  selectedStrike?: number | null
  selectedType?: 'CE' | 'PE' | null
  onSelect?: (opt: SelectedOption) => void
  underlying: string
  expiry: string | null
}) {
  const oiChange = fmtOIChange(row.ce_oi_change)
  const peOIChange = fmtOIChange(row.pe_oi_change)
  const ceSelected = selectedStrike === row.strike_price && selectedType === 'CE'
  const peSelected = selectedStrike === row.strike_price && selectedType === 'PE'

  const handleCE = () => onSelect?.({ strike: row.strike_price, optionType: 'CE', ltp: row.ce_ltp, expiry, underlying, ref_id: row.ce_ref_id ?? null })
  const handlePE = () => onSelect?.({ strike: row.strike_price, optionType: 'PE', ltp: row.pe_ltp, expiry, underlying, ref_id: row.pe_ref_id ?? null })

  return (
    <tr className={row.is_atm ? 'oc-row-atm' : undefined}>
      {/* CE side */}
      <td className={`oc-td-num neg-text${ceSelected ? ' oc-td-selected' : ''}${onSelect ? ' oc-td-clickable' : ''}`} onClick={onSelect ? handleCE : undefined}>{row.ce_iv != null ? `${row.ce_iv.toFixed(1)}%` : '--'}</td>
      <td className={`oc-td-num${ceSelected ? ' oc-td-selected' : ''}${onSelect ? ' oc-td-clickable' : ''}`} onClick={onSelect ? handleCE : undefined}>{fmt(row.ce_ltp, 2)}</td>
      <td className="oc-td-num">
        <span className={oiChange.cls}>{oiChange.text}</span>
      </td>
      <td className={`oc-td-oi${ceSelected ? ' oc-td-selected' : ''}${onSelect ? ' oc-td-clickable' : ''}`} onClick={onSelect ? handleCE : undefined}>
        <div className="oi-bar-cell oi-bar-cell-ce">
          <span>{fmtOI(row.ce_oi)}</span>
          <OIBar value={row.ce_oi} max={maxOI} side="ce" />
        </div>
      </td>
      {/* Strike */}
      <td className="oc-td-strike">
        <span className={row.is_atm ? 'oc-atm-badge' : undefined}>{row.strike_price}</span>
      </td>
      {/* PE side */}
      <td className={`oc-td-oi${peSelected ? ' oc-td-selected' : ''}${onSelect ? ' oc-td-clickable' : ''}`} onClick={onSelect ? handlePE : undefined}>
        <div className="oi-bar-cell oi-bar-cell-pe">
          <OIBar value={row.pe_oi} max={maxOI} side="pe" />
          <span>{fmtOI(row.pe_oi)}</span>
        </div>
      </td>
      <td className="oc-td-num">
        <span className={peOIChange.cls}>{peOIChange.text}</span>
      </td>
      <td className={`oc-td-num${peSelected ? ' oc-td-selected' : ''}${onSelect ? ' oc-td-clickable' : ''}`} onClick={onSelect ? handlePE : undefined}>{fmt(row.pe_ltp, 2)}</td>
      <td className={`oc-td-num pos-text${peSelected ? ' oc-td-selected' : ''}${onSelect ? ' oc-td-clickable' : ''}`} onClick={onSelect ? handlePE : undefined}>{row.pe_iv != null ? `${row.pe_iv.toFixed(1)}%` : '--'}</td>
    </tr>
  )
}

export default function OptionChainTable({ data, loading, error, isStale, selectedStrike, selectedType, onSelectOption, onRetry }: OptionChainTableProps) {
  if (error) {
    return (
      <div className="options-chain-wrap">
        <p className="options-empty">{error}</p>
      </div>
    )
  }

  if (loading && !data) {
    return (
      <div className="options-chain-wrap">
        <p className="options-empty">Loading option chain...</p>
      </div>
    )
  }

  if (!data || !data.strikes.length) {
    const msg = !data
      ? 'Loading option chain...'
      : data.market_closed
        ? 'Market closed — showing last available data.'
        : 'Fetching option chain data...'
    return (
      <div className="options-chain-wrap">
        <p className="options-empty">{msg}</p>
        {onRetry && !loading && (
          <button className="ghost-inline" style={{ margin: '8px auto', display: 'block', fontSize: '12px' }} onClick={onRetry}>
            Retry now
          </button>
        )}
        {loading && <p className="options-empty" style={{ fontSize: '11px', opacity: 0.5 }}>Fetching…</p>}
      </div>
    )
  }

  const maxOI = Math.max(
    ...data.strikes.flatMap((r) => [r.ce_oi ?? 0, r.pe_oi ?? 0]),
    1,
  )

  const hasOI = data.strikes.some((r) => r.ce_oi != null || r.pe_oi != null)
  const hasIV = data.strikes.some((r) => r.ce_iv != null || r.pe_iv != null)
  const hasLTP = data.strikes.some((r) => r.ce_ltp != null || r.pe_ltp != null)

  return (
    <div className="options-chain-wrap">
      <div className="options-chain-header">
        <span>Option Chain</span>
        {data.expiry && <span className="options-chain-expiry">{data.expiry}</span>}
        {isStale && <span className="options-chain-stale">Last session</span>}
        {loading && <span className="options-chain-refreshing">Refreshing...</span>}
      </div>
      <div className="options-chain-scroll">
        <table className="options-chain-table">
          <thead>
            <tr>
              <th>IV</th>
              <th>LTP</th>
              <th>Chg OI</th>
              <th className="oc-th-oi">CE OI</th>
              <th className="oc-th-strike">Strike</th>
              <th className="oc-th-oi">PE OI</th>
              <th>Chg OI</th>
              <th>LTP</th>
              <th>IV</th>
            </tr>
          </thead>
          <tbody>
            {data.strikes.map((row) => (
              <StrikeRow
                key={row.strike_price}
                row={row}
                maxOI={maxOI}
                selectedStrike={selectedStrike}
                selectedType={selectedType}
                onSelect={onSelectOption}
                underlying={data.underlying}
                expiry={data.expiry}
              />
            ))}
          </tbody>
        </table>
        {!hasOI && !hasIV && !hasLTP && (
          <p className="options-chain-note">
            OI / IV data not yet available from this exchange session. Delta and strike data shown.
          </p>
        )}
      </div>
    </div>
  )
}
