import { useState, useEffect, useCallback } from 'react'

interface OIEAlert {
  id: string
  underlying: string
  created_at: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  message: string
  match_score: number
  matched_count: number
  total_count: number
}

interface AlertConfig {
  underlying: string
  enabled: boolean
  min_score: number
  severity_filter: 'all' | 'warning' | 'critical'
}

interface Props {
  sessionToken: string
  deviceId: string
  environment: string
  underlying: string
}

const SEVERITY_COLOR: Record<string, string> = {
  info: 'var(--fg-faint)',
  warning: 'var(--accent)',
  critical: 'var(--neg)',
}

const SEVERITY_LABEL: Record<string, string> = {
  info: 'INFO',
  warning: 'WARN',
  critical: 'CRIT',
}

function relTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const s = Math.round(diff / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  return `${Math.round(s / 3600)}h ago`
}

export default function AlertsTab({ sessionToken, deviceId, environment, underlying }: Props) {
  const [alerts, setAlerts] = useState<OIEAlert[]>([])
  const [config, setConfig] = useState<AlertConfig>({
    underlying,
    enabled: true,
    min_score: 60,
    severity_filter: 'all',
  })
  const [loading, setLoading] = useState(false)
  const [lastFetch, setLastFetch] = useState<string | null>(null)

  const fetchAlerts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/oie/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_token: sessionToken,
          device_id: deviceId,
          environment,
          underlying,
          limit: 50,
        }),
      })
      if (res.ok) {
        const data = await res.json() as { alerts: OIEAlert[] }
        setAlerts(data.alerts || [])
        setLastFetch(new Date().toLocaleTimeString())
      }
    } finally {
      setLoading(false)
    }
  }, [sessionToken, deviceId, environment, underlying])

  useEffect(() => {
    fetchAlerts()
    if (!config.enabled) return
    const t = setInterval(fetchAlerts, 30_000)
    return () => clearInterval(t)
  }, [fetchAlerts, config.enabled])

  const filtered = alerts.filter((a) => {
    if (config.severity_filter !== 'all' && a.severity !== config.severity_filter) return false
    if (a.match_score < config.min_score) return false
    return true
  })

  return (
    <div>
      {/* Monitor Control Strip */}
      <div className="alert-control-strip">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            className={`circuit-breaker-indicator ${config.enabled ? 'active' : 'inactive'}`}
            onClick={() => setConfig((c) => ({ ...c, enabled: !c.enabled }))}
            title={config.enabled ? 'Monitoring active — click to pause' : 'Monitoring paused — click to activate'}
          >
            <div className="cb-dot" />
            {config.enabled ? 'MONITORING' : 'PAUSED'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-faint)' }}>
            {lastFetch ? `Updated ${lastFetch}` : 'Not yet fetched'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: 'var(--fg-faint)' }}>
            Min score:
            <input
              type="number"
              min={0}
              max={100}
              value={config.min_score}
              onChange={(e) => setConfig((c) => ({ ...c, min_score: parseInt(e.target.value) || 0 }))}
              className="condition-value-input"
              style={{ width: 60, marginLeft: 6 }}
            />
          </label>
          <select
            className="condition-select"
            value={config.severity_filter}
            onChange={(e) => setConfig((c) => ({ ...c, severity_filter: e.target.value as AlertConfig['severity_filter'] }))}
          >
            <option value="all">All Severities</option>
            <option value="warning">Warning+</option>
            <option value="critical">Critical Only</option>
          </select>
          <button className="btn-sm" onClick={fetchAlerts} disabled={loading}>
            {loading ? '…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Alert Feed */}
      {filtered.length === 0 ? (
        <div className="oie-loading" style={{ paddingTop: 40 }}>
          {alerts.length === 0 ? 'No alerts yet. Alerts fire when strategy conditions are met.' : 'No alerts match current filter.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {filtered.map((alert) => (
            <div key={alert.id} className="alert-monitor-card">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div
                  className="alert-severity-badge"
                  style={{ color: SEVERITY_COLOR[alert.severity] }}
                >
                  {SEVERITY_LABEL[alert.severity]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3 }}>{alert.title}</div>
                  <div style={{ fontSize: 13, color: 'var(--fg-dim)', marginBottom: 6 }}>{alert.message}</div>
                  <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--fg-faint)' }}>
                    <span>{alert.underlying}</span>
                    <span>Score: {alert.match_score}%</span>
                    <span>{alert.matched_count}/{alert.total_count} conditions</span>
                    <span>{relTime(alert.created_at)}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="alert-score-ring">
                    <svg width={36} height={36} viewBox="0 0 36 36">
                      <circle cx={18} cy={18} r={14} fill="none" stroke="var(--hairline)" strokeWidth={3} />
                      <circle
                        cx={18} cy={18} r={14}
                        fill="none"
                        stroke={SEVERITY_COLOR[alert.severity]}
                        strokeWidth={3}
                        strokeDasharray={`${alert.match_score / 100 * 87.96} 87.96`}
                        strokeLinecap="round"
                        transform="rotate(-90 18 18)"
                      />
                    </svg>
                    <span className="alert-score-text">{alert.match_score}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
