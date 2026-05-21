import type React from 'react'

import WidgetFrame from '../dashboard/WidgetFrame'
import RealtimeTable from '../dashboard/RealtimeTable'
import { ScorePill, SignalChip, metricTone } from '../dashboard/MetricTile'
import type { OpportunitySnapshot } from '../../positioning/types'

export default function OpportunityTable({
  opportunities,
  selectedSymbol,
  onSelect,
}: {
  opportunities?: OpportunitySnapshot
  selectedSymbol?: string | null
  onSelect?: (symbol: string) => void
}) {
  const rows = opportunities?.rows ?? []
  return (
    <WidgetFrame
      title="Execution Radar"
      kicker="Opportunity quality"
      className="positioning-widget-focus"
      right={<span className="positioning-count-pill">{rows.length} ranked</span>}
    >
      <RealtimeTable columns={['Rank', 'Instrument', 'Sector', 'Momentum', 'Liquidity', 'Quality']}>
        {rows.length === 0 ? (
          <div className="positioning-empty terminal">
            <strong>Building execution radar</strong>
            <span>Warming scanner cache, breadth model, and participation alignment.</span>
          </div>
        ) : null}
        {rows.map((row, index) => (
          <button
            key={`${row.exchange}-${row.symbol}`}
            className={`positioning-rt-row positioning-opportunity-row ${selectedSymbol === row.symbol ? 'is-selected' : ''} ${metricTone(row.quality_score)}`}
            onClick={() => onSelect?.(row.symbol)}
            style={{
              '--quality': `${Math.max(0, Math.min(100, row.quality_score ?? 0))}%`,
              '--momentum': `${Math.max(4, Math.min(100, Math.abs(row.change_pct ?? 0) * 18))}%`,
            } as React.CSSProperties}
          >
            <span className="positioning-rank">#{index + 1}</span>
            <span className="positioning-symbol-cell">
              <strong>{row.symbol}</strong>
              <small>{row.display_name || row.exchange || 'NSE'}</small>
            </span>
            <span className="positioning-sector-cell">
              <strong>{row.sector ?? 'Unmapped'}</strong>
              <SignalChip tone={metricTone(row.quality_score)}>Align {row.quality_score ? Math.round(row.quality_score) : 0}</SignalChip>
            </span>
            <span className="positioning-momentum-cell">
              <strong className={(row.change_pct ?? 0) >= 0 ? 'pos-text' : 'neg-text'}>
                {(row.change_pct ?? 0) >= 0 ? '+' : ''}{(row.change_pct ?? 0).toFixed(2)}%
              </strong>
              <i className={(row.change_pct ?? 0) >= 0 ? 'positioning-strength-bar positive' : 'positioning-strength-bar negative'}><b /></i>
            </span>
            <span className="positioning-liquidity-cell">
              <strong>{(row.volume_ratio ?? 0).toFixed(2)}x</strong>
              <small>{(row.volume_ratio ?? 0) >= 2 ? 'abnormal tape' : 'normal tape'}</small>
            </span>
            <span className="positioning-quality-cell">
              <ScorePill value={row.quality_score} />
              <i className="positioning-quality-bar"><b /></i>
              <small>{row.reason?.[0] ?? 'awaiting confirmation'}</small>
              <span className="positioning-reason-strip">
                {(row.reason ?? []).slice(1, 3).map((reason) => <em key={reason}>{reason}</em>)}
              </span>
            </span>
          </button>
        ))}
      </RealtimeTable>
    </WidgetFrame>
  )
}
