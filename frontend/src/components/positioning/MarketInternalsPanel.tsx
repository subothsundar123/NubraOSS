import WidgetFrame from '../dashboard/WidgetFrame'
import { ConfidenceBar, DirectionBadge, SignalChip, metricTone } from '../dashboard/MetricTile'
import InfoTip from '../InfoTip'
import type { MarketInternalsSnapshot } from '../../positioning/types'

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export default function MarketInternalsPanel({ internals }: { internals?: MarketInternalsSnapshot }) {
  const score = internals?.score.score ?? 50
  const participation = internals?.participation ?? {}
  const liquidity = internals?.liquidity ?? {}
  const concentration = internals?.concentration ?? {}
  const acceptance = internals?.acceptance ?? {}
  const thrusts = internals?.thrusts ?? []

  return (
    <WidgetFrame
      title="Market Internals"
      kicker="Participation quality"
      className="positioning-widget-wide"
      right={<DirectionBadge direction={internals?.score.direction} />}
      info="market_internals"
    >
      <div className="positioning-internals-head">
        <div>
          <span>Control State <InfoTip term="control_state" /></span>
          <strong>{(internals?.control_state ?? 'rotational_balance').replace(/_/g, ' ')}</strong>
          <small>{internals?.transition_reason ?? 'Waiting for market internals.'}</small>
        </div>
        <div className="positioning-internals-score">
          <strong>{score.toFixed(1)}</strong>
          <ConfidenceBar value={internals?.score.confidence ?? 0} />
        </div>
      </div>

      <div className="positioning-internals-grid">
        <div><span>Above Open <InfoTip term="above_open" /></span><strong>{num(participation.above_open_pct).toFixed(1)}%</strong></div>
        <div><span>Accepted <InfoTip term="accepted" /></span><strong>{num(acceptance.accepted_pct).toFixed(1)}%</strong></div>
        <div><span>Rejected</span><strong>{num(acceptance.rejected_pct).toFixed(1)}%</strong></div>
        <div><span>Liquidity <InfoTip term="liquidity" /></span><strong>{num(liquidity.abnormal_turnover_pct).toFixed(1)}%</strong></div>
        <div><span>Sector Breadth <InfoTip term="breadth" /></span><strong>{num(participation.sector_participation_breadth).toFixed(1)}%</strong></div>
        <div><span>Top Sector <InfoTip term="concentration" /></span><strong>{num(concentration.top_sector_share).toFixed(1)}%</strong></div>
      </div>

      <div className="positioning-internals-meters">
        <label><span>Participation</span><i><b style={{ width: `${Math.max(0, Math.min(100, score))}%` }} /></i></label>
        <label><span>Liquidity Expansion</span><i><b style={{ width: `${Math.max(0, Math.min(100, num(liquidity.expanding_turnover_pct)))}%` }} /></i></label>
        <label><span>Concentration Risk</span><i className="risk"><b style={{ width: `${Math.max(0, Math.min(100, num(concentration.top_sector_share)))}%` }} /></i></label>
      </div>

      <div className="positioning-chip-row internals">
        {thrusts.length === 0 ? <SignalChip>No thrust event</SignalChip> : thrusts.slice(0, 3).map((thrust, index) => (
          <SignalChip key={`${thrust.type}-${index}`} tone={metricTone(thrust.severity === 'warning' ? 30 : 70)}>
            {String(thrust.type ?? 'event').replace(/_/g, ' ')}
          </SignalChip>
        ))}
      </div>
    </WidgetFrame>
  )
}
