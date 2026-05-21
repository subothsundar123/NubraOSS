import type { PositioningConnectionState, PositioningSnapshot } from '../../positioning/types'
import MetricTile, { DirectionBadge, LiveIndicator, formatScore } from '../dashboard/MetricTile'

function minutesSinceOpen(): string {
  const now = new Date()
  const open = new Date(now)
  open.setHours(9, 15, 0, 0)
  const diff = Math.max(0, Math.floor((now.getTime() - open.getTime()) / 60000))
  if (diff <= 0) return 'Pre-open'
  const hours = Math.floor(diff / 60)
  const minutes = diff % 60
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`
}

function openingRangeState(snapshot: PositioningSnapshot | null): string {
  const regime = snapshot?.regime?.regime ?? 'neutral'
  if (regime === 'trend_up') return 'OR holding up'
  if (regime === 'trend_down') return 'OR pressure'
  if (regime === 'mean_reversion') return 'Fade watch'
  return 'Developing'
}

export default function MarketStateStrip({
  snapshot,
  connection,
}: {
  snapshot: PositioningSnapshot | null
  connection: PositioningConnectionState
}) {
  const sentiment = snapshot?.sentiment?.score?.score ?? 50
  const breadth = snapshot?.breadth?.score?.score ?? 50
  const options = snapshot?.options_pressure?.score?.score ?? 50
  const smartMoney = snapshot?.smart_money?.score?.score ?? 50
  const internals = snapshot?.market_internals?.score?.score ?? 50
  const volatility = snapshot?.regime?.regime === 'volatile_chop' ? 'High chop' : snapshot?.regime?.regime === 'range' ? 'Contained' : 'Directional'
  return (
    <section className="positioning-state-strip">
      <MetricTile label="Sentiment" value={formatScore(sentiment)} detail={snapshot?.sentiment?.label ?? 'Bootstrapping'} score={sentiment} confidence={snapshot?.sentiment?.score?.confidence ?? 0} large info="sentiment" />
      <MetricTile label="Regime" value={snapshot?.regime?.label ?? 'Neutral'} detail={<DirectionBadge direction={snapshot?.regime?.score?.direction} />} score={sentiment} confidence={snapshot?.regime?.score?.confidence ?? 0} info="regime" />
      <MetricTile label="Breadth" value={formatScore(breadth)} detail={snapshot?.breadth ? `${snapshot.breadth.advances} adv / ${snapshot.breadth.declines} dec` : 'Waiting'} score={breadth} confidence={snapshot?.breadth?.score?.confidence ?? 0} info="breadth" />
      <MetricTile label="Options Bias" value={formatScore(options)} detail={snapshot?.options_pressure?.score?.direction ?? 'proxy'} score={options} confidence={snapshot?.options_pressure?.score?.confidence ?? 0} info="options_bias" />
      <MetricTile label="Smart Money" value={formatScore(smartMoney)} detail={`${snapshot?.smart_money?.candidates?.length ?? 0} candidates`} score={smartMoney} confidence={snapshot?.smart_money?.score?.confidence ?? 0} info="smart_money" />
      <MetricTile label="Control" value={(snapshot?.market_internals?.control_state ?? 'Balance').replace(/_/g, ' ')} detail={`PQ ${formatScore(internals)}`} score={internals} confidence={snapshot?.market_internals?.score?.confidence ?? 0} info="control_state" />
      <MetricTile label="Volatility" value={volatility} detail={openingRangeState(snapshot)} score={snapshot?.regime?.regime === 'volatile_chop' ? 35 : 55} confidence={snapshot?.regime?.score?.confidence ?? 0} info="volatility" />
      <MetricTile label="Session" value={minutesSinceOpen()} detail={snapshot?.market_status ?? 'unknown'} score={50} />
      <div className={`positioning-metric-tile ${connection.connected ? 'positive' : 'negative'} feed`}>
        <div className="positioning-metric-top"><span>Feed Health</span><LiveIndicator live={connection.connected} /></div>
        <strong>{connection.connected ? 'Streaming' : connection.connecting ? 'Connecting' : 'Offline'}</strong>
        <small>Seq {snapshot?.seq ?? 0} / {connection.lastMessageAt ? new Date(connection.lastMessageAt).toLocaleTimeString() : '--'}</small>
      </div>
    </section>
  )
}
