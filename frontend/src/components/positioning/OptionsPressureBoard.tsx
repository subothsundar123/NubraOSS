import WidgetFrame from '../dashboard/WidgetFrame'
import { DirectionBadge } from '../dashboard/MetricTile'
import InfoTip from '../InfoTip'
import type { OptionsPressureSnapshot } from '../../positioning/types'

export default function OptionsPressureBoard({ options }: { options?: OptionsPressureSnapshot }) {
  const call = options?.call_pressure ?? 50
  const put = options?.put_pressure ?? 50
  return (
    <WidgetFrame title="Options Pressure" kicker="Strike pressure proxy" right={<DirectionBadge direction={options?.score.direction} />} info="options_pressure">
      <div className="positioning-pressure-board">
        <div className="positioning-pressure-side call">
          <span>Call Pressure <InfoTip term="options_pressure" /></span>
          <strong>{call.toFixed(1)}</strong>
          <div><i style={{ width: `${call}%` }} /></div>
        </div>
        <div className="positioning-pressure-side put">
          <span>Put Pressure</span>
          <strong>{put.toFixed(1)}</strong>
          <div><i style={{ width: `${put}%` }} /></div>
        </div>
      </div>
      <ul className="positioning-explain-list">
        {(options?.score.explanation ?? ['Waiting for option-chain pressure wiring.']).map((line) => <li key={line}>{line}</li>)}
      </ul>
    </WidgetFrame>
  )
}
