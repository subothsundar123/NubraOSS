import type { MetricResult, OIEChainResponse } from './useOIEData'

interface Props {
  metrics: Record<string, MetricResult>
  spotPrice?: number | null
  chain?: OIEChainResponse | null
}

const GROUPS: { key: string; title: string; metrics: string[] }[] = [
  {
    key: 'oi',
    title: 'Open Interest',
    metrics: ['pcr', 'dynamic_pcr', 'oi_momentum', 'oi_concentration', 'oi_imbalance', 'call_wall', 'put_wall', 'max_pain'],
  },
  {
    key: 'volatility',
    title: 'Volatility',
    metrics: ['atm_iv', 'iv_rank', 'iv_percentile', 'expected_move', 'iv_skew', 'vol_regime'],
  },
  {
    key: 'dealer',
    title: 'Dealer / Greeks',
    metrics: ['gex', 'gamma_regime', 'gamma_flip', 'vanna_exposure', 'charm_exposure', 'hedging_pressure', 'pin_risk'],
  },
]

function valueClass(trend: string) {
  if (trend === 'up') return 'up'
  if (trend === 'down') return 'down'
  return 'neutral'
}

export default function AnalyticsTab({ metrics }: Props) {
  if (!metrics || Object.keys(metrics).length === 0) {
    return <div className="oie-loading">No analytics data yet. Refresh to compute metrics.</div>
  }

  return (
    <div className="analytics-groups">
      {GROUPS.map((group) => {
        const groupMetrics = group.metrics
          .map((k) => metrics[k])
          .filter(Boolean)
        if (groupMetrics.length === 0) return null
        return (
          <div key={group.key}>
            <div className="analytics-group-title">{group.title}</div>
            <div className="analytics-metrics-grid">
              {groupMetrics.map((m) => (
                <div key={m.key} className="analytics-metric-card">
                  <div className="analytics-metric-key">{m.key.replace(/_/g, ' ')}</div>
                  <div className="analytics-metric-label">{m.label}</div>
                  <div className={`analytics-metric-value ${valueClass(m.trend)}`}>
                    {m.formatted}
                  </div>
                  <div className="analytics-metric-interp">{m.interpretation}</div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
