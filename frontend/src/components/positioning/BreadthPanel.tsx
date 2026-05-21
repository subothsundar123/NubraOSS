import WidgetFrame from '../dashboard/WidgetFrame'
import { ConfidenceBar, DirectionBadge } from '../dashboard/MetricTile'
import InfoTip from '../InfoTip'
import type { BreadthSnapshot } from '../../positioning/types'

export default function BreadthPanel({ breadth }: { breadth?: BreadthSnapshot }) {
  const score = breadth?.score.score ?? 50
  const total = (breadth?.advances ?? 0) + (breadth?.declines ?? 0) + (breadth?.unchanged ?? 0)
  const advWidth = total ? ((breadth?.advances ?? 0) / total) * 100 : 50
  return (
    <WidgetFrame title="Breadth Map" kicker="Participation" info="breadth">
      <div className="positioning-score-row">
        <strong>{score.toFixed(1)}</strong>
        <DirectionBadge direction={breadth?.score.direction} />
      </div>
      <ConfidenceBar value={breadth?.score.confidence ?? 0} />
      <div className="positioning-breadth-bar">
        <div style={{ width: `${advWidth}%` }} />
      </div>
      <div className="positioning-metric-grid">
        <div><span>Adv</span><strong>{breadth?.advances ?? 0}</strong></div>
        <div><span>Dec</span><strong>{breadth?.declines ?? 0}</strong></div>
        <div><span>Part <InfoTip term="breadth" /></span><strong>{(breadth?.participation_pct ?? 0).toFixed(1)}%</strong></div>
      </div>
      <ul className="positioning-explain-list">
        {(breadth?.score.explanation ?? ['Waiting for active scanner rows.']).map((line) => <li key={line}>{line}</li>)}
      </ul>
    </WidgetFrame>
  )
}
