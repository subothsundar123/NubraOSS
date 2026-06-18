import { useState } from 'react'

interface BacktestConfig {
  underlying: string
  from_date: string
  to_date: string
  strategy_id: string
  position_size_lots: number
}

interface TradeResult {
  date: string
  signal: string
  entry: number
  exit: number
  pnl: number
  duration_min: number
  reason: string
}

interface BacktestResult {
  total_trades: number
  winning_trades: number
  losing_trades: number
  total_pnl: number
  max_drawdown: number
  win_rate: number
  avg_win: number
  avg_loss: number
  profit_factor: number
  sharpe_ratio: number
  trades: TradeResult[]
}

interface Props {
  sessionToken: string
  deviceId: string
  environment: string
  underlying: string
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function nDaysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function fmt(n: number, decimals = 2): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export default function BacktestTab({ sessionToken, deviceId, environment, underlying }: Props) {
  const [config, setConfig] = useState<BacktestConfig>({
    underlying,
    from_date: nDaysAgo(30),
    to_date: today(),
    strategy_id: '',
    position_size_lots: 1,
  })
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runBacktest = async () => {
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/oie/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_token: sessionToken,
          device_id: deviceId,
          environment,
          ...config,
        }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error((e as { detail?: string }).detail || `HTTP ${res.status}`)
      }
      const data = await res.json() as BacktestResult
      setResult(data)
    } catch (e: unknown) {
      setError((e as Error).message || 'Backtest failed')
    } finally {
      setRunning(false)
    }
  }

  const statColor = (v: number) => v > 0 ? 'var(--pos)' : v < 0 ? 'var(--neg)' : 'var(--fg)'

  return (
    <div>
      {/* Config Panel */}
      <div className="risk-profile-card" style={{ marginBottom: 20 }}>
        <div className="analytics-group-title" style={{ marginBottom: 12 }}>Backtest Parameters</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginBottom: 4 }}>Underlying</div>
            <select
              className="condition-select"
              value={config.underlying}
              onChange={(e) => setConfig((c) => ({ ...c, underlying: e.target.value }))}
            >
              {['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX'].map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginBottom: 4 }}>From</div>
            <input
              type="date"
              className="condition-value-input"
              value={config.from_date}
              onChange={(e) => setConfig((c) => ({ ...c, from_date: e.target.value }))}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginBottom: 4 }}>To</div>
            <input
              type="date"
              className="condition-value-input"
              value={config.to_date}
              onChange={(e) => setConfig((c) => ({ ...c, to_date: e.target.value }))}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginBottom: 4 }}>Lot Size</div>
            <input
              type="number"
              min={1}
              className="condition-value-input"
              style={{ width: 70 }}
              value={config.position_size_lots}
              onChange={(e) => setConfig((c) => ({ ...c, position_size_lots: parseInt(e.target.value) || 1 }))}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {['7D', '30D', '90D'].map((label) => {
              const days = label === '7D' ? 7 : label === '30D' ? 30 : 90
              return (
                <button
                  key={label}
                  className="btn-sm"
                  onClick={() => setConfig((c) => ({ ...c, from_date: nDaysAgo(days), to_date: today() }))}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <button
            className="btn-primary"
            onClick={runBacktest}
            disabled={running}
            style={{ marginLeft: 'auto' }}
          >
            {running ? 'Running…' : '▶ Run Backtest'}
          </button>
        </div>
        {error && (
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--neg)' }}>{error}</div>
        )}
      </div>

      {running && (
        <div className="oie-loading">Running backtest… this may take a few seconds.</div>
      )}

      {result && (
        <>
          {/* Summary Stats */}
          <div className="risk-profile-card" style={{ marginBottom: 20 }}>
            <div className="analytics-group-title" style={{ marginBottom: 12 }}>Results Summary</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
              {[
                { label: 'Total P&L', value: `₹${fmt(result.total_pnl)}`, color: statColor(result.total_pnl) },
                { label: 'Win Rate', value: `${fmt(result.win_rate, 1)}%`, color: result.win_rate >= 50 ? 'var(--pos)' : 'var(--neg)' },
                { label: 'Total Trades', value: String(result.total_trades), color: 'var(--fg)' },
                { label: 'Profit Factor', value: fmt(result.profit_factor), color: result.profit_factor >= 1 ? 'var(--pos)' : 'var(--neg)' },
                { label: 'Max Drawdown', value: `₹${fmt(Math.abs(result.max_drawdown))}`, color: 'var(--neg)' },
                { label: 'Sharpe Ratio', value: fmt(result.sharpe_ratio), color: result.sharpe_ratio >= 1 ? 'var(--pos)' : 'var(--fg-dim)' },
                { label: 'Avg Win', value: `₹${fmt(result.avg_win)}`, color: 'var(--pos)' },
                { label: 'Avg Loss', value: `₹${fmt(Math.abs(result.avg_loss))}`, color: 'var(--neg)' },
              ].map((s) => (
                <div key={s.label} className="analytics-metric-card">
                  <div className="analytics-metric-label">{s.label}</div>
                  <div className="analytics-metric-value" style={{ color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Trades Table */}
          {result.trades.length > 0 && (
            <div className="risk-profile-card">
              <div className="analytics-group-title" style={{ marginBottom: 10 }}>
                Trade Log ({result.total_trades} trades)
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--hairline)', color: 'var(--fg-faint)', fontSize: 11 }}>
                      {['DATE', 'SIGNAL', 'ENTRY', 'EXIT', 'P&L', 'DURATION', 'REASON'].map((h) => (
                        <th key={h} style={{ textAlign: h === 'P&L' ? 'right' : 'left', padding: '6px 8px', letterSpacing: '0.07em' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.trades.map((t, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--hairline)' }}>
                        <td style={{ padding: '7px 8px', color: 'var(--fg-faint)' }}>{t.date}</td>
                        <td style={{ padding: '7px 8px' }}>
                          <span style={{
                            fontSize: 11, fontWeight: 600,
                            color: t.signal === 'BUY' ? 'var(--pos)' : t.signal === 'SELL' ? 'var(--neg)' : 'var(--fg-faint)',
                          }}>
                            {t.signal}
                          </span>
                        </td>
                        <td style={{ padding: '7px 8px' }}>{fmt(t.entry)}</td>
                        <td style={{ padding: '7px 8px' }}>{fmt(t.exit)}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 600, color: statColor(t.pnl) }}>
                          {t.pnl >= 0 ? '+' : ''}₹{fmt(t.pnl)}
                        </td>
                        <td style={{ padding: '7px 8px', color: 'var(--fg-faint)' }}>{t.duration_min}m</td>
                        <td style={{ padding: '7px 8px', color: 'var(--fg-faint)', fontSize: 12 }}>{t.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {!result && !running && (
        <div className="oie-loading" style={{ paddingTop: 40 }}>
          Configure parameters above and click Run Backtest to analyze historical signal performance.
        </div>
      )}
    </div>
  )
}
