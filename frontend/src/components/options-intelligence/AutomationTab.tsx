import { useState, useEffect, useCallback } from 'react'
import type { OIEChainResponse, OIESignalResponse } from './useOIEData'

interface RiskProfile {
  max_loss_per_trade: number
  max_daily_loss: number
  position_size_lots: number
  stop_loss_pct: number
  target_pct: number
  time_stop_minutes: number
}

interface CircuitBreaker {
  enabled: boolean
  max_consecutive_losses: number
  daily_pnl_floor: number
  active: boolean
}

interface ExecutionLog {
  id: string
  executed_at: string
  signal_direction: string
  strike_price: number
  option_type: string
  order_side: string
  lots: number
  order_qty: number
  ltp_price: number
  limit_price: number
  estimated_value: number
  order_id: number | null
  order_status: string | null
  instrument_display_name: string
  status: string
  error_message: string | null
}

interface Props {
  sessionToken: string
  deviceId: string
  environment: string
  underlying: string
  marketBias?: string
  confidence?: number
  chain?: OIEChainResponse | null
  signalReport?: OIESignalResponse | null
}

const DEFAULT_RISK: RiskProfile = {
  max_loss_per_trade: 5000,
  max_daily_loss: 15000,
  position_size_lots: 1,
  stop_loss_pct: 25,
  target_pct: 50,
  time_stop_minutes: 60,
}

const DEFAULT_CB: CircuitBreaker = {
  enabled: true,
  max_consecutive_losses: 3,
  daily_pnl_floor: -15000,
  active: false,
}

function RiskField({
  label, value, onChange, prefix = '', suffix = '', min = 0, step = 1
}: {
  label: string
  value: number
  onChange: (v: number) => void
  prefix?: string
  suffix?: string
  min?: number
  step?: number
}) {
  return (
    <div className="risk-field">
      <div className="risk-field-label">{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {prefix && <span style={{ fontSize: 13, color: 'var(--fg-faint)' }}>{prefix}</span>}
        <input
          type="number"
          min={min}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="condition-value-input"
          style={{ width: 90 }}
        />
        {suffix && <span style={{ fontSize: 13, color: 'var(--fg-faint)' }}>{suffix}</span>}
      </div>
    </div>
  )
}

export default function AutomationTab({
  sessionToken, deviceId, environment, underlying,
  marketBias = 'Neutral', confidence = 50,
  chain = null, signalReport = null,
}: Props) {
  const [risk, setRisk] = useState<RiskProfile>(DEFAULT_RISK)
  const [cb, setCb] = useState<CircuitBreaker>(DEFAULT_CB)
  const [automationEnabled, setAutomationEnabled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [executions, setExecutions] = useState<ExecutionLog[]>([])
  const [executing, setExecuting] = useState(false)
  const [execMsg, setExecMsg] = useState<{ text: string; ok: boolean } | null>(null)

  // Derive proposed trade from signal + chain
  const atmStrike = chain?.atm_strike ?? null
  const atmRow = atmStrike ? chain?.strikes?.find((s) => s.is_atm) : null
  const proposedOptionType: 'CE' | 'PE' = marketBias.toLowerCase() === 'bearish' ? 'CE' : 'PE'
  const proposedSide = 'ORDER_SIDE_SELL'
  const proposedLtp = proposedOptionType === 'PE'
    ? (atmRow?.pe_ltp ?? 0)
    : (atmRow?.ce_ltp ?? 0)

  const fetchExecutions = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/oie/executions?underlying=${underlying}&environment=${environment}&limit=10`
      )
      if (res.ok) {
        const data = await res.json()
        setExecutions(data.executions || [])
      }
    } catch {/* silent */}
  }, [underlying, environment])

  useEffect(() => {
    fetchExecutions()
  }, [fetchExecutions])

  const updateRisk = (field: keyof RiskProfile, val: number) => {
    setRisk((r) => ({ ...r, [field]: val }))
  }

  const saveRisk = async () => {
    setSaving(true)
    setSaveMsg('')
    try {
      const res = await fetch('/api/oie/risk/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_token: sessionToken,
          device_id: deviceId,
          environment,
          underlying,
          risk_profile: risk,
          circuit_breaker: cb,
          automation_enabled: automationEnabled,
        }),
      })
      if (res.ok) {
        setSaveMsg('Risk profile saved.')
      } else {
        setSaveMsg('Save failed — check connection.')
      }
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(''), 3000)
    }
  }

  const executeNow = async () => {
    if (!atmStrike || proposedLtp <= 0) {
      setExecMsg({ text: 'No live chain data — wait for WebSocket push.', ok: false })
      return
    }
    if (!automationEnabled) {
      setExecMsg({ text: 'Enable automation first, then save the configuration.', ok: false })
      return
    }
    setExecuting(true)
    setExecMsg(null)
    try {
      const res = await fetch('/api/oie/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_token: sessionToken,
          device_id: deviceId,
          environment,
          underlying,
          expiry: chain?.expiry || null,
          strike_price: atmStrike,
          option_type: proposedOptionType,
          order_side: proposedSide,
          lots: risk.position_size_lots,
          ltp_price: proposedLtp,
          signal_direction: marketBias,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setExecMsg({
          text: `Order placed — ${data.instrument} × ${data.order_qty} qty @ ₹${data.limit_price}`,
          ok: true,
        })
        fetchExecutions()
      } else {
        setExecMsg({ text: data.detail || 'Execution failed', ok: false })
      }
    } catch (e) {
      setExecMsg({ text: 'Network error during execution', ok: false })
    } finally {
      setExecuting(false)
    }
  }

  const biasClass = (b: string) => {
    const l = b.toLowerCase()
    if (l === 'bullish') return 'var(--pos)'
    if (l === 'bearish') return 'var(--neg)'
    return 'var(--fg-dim)'
  }

  const autoPilotWarning = confidence < 55 && automationEnabled

  return (
    <div>
      {/* Live Signal Summary */}
      <div className="risk-profile-card" style={{ marginBottom: 20 }}>
        <div className="analytics-group-title" style={{ marginBottom: 12 }}>Live Signal State</div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--fg-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Market Bias</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: biasClass(marketBias) }}>{marketBias}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--fg-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Confidence</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{confidence.toFixed(0)}%</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--fg-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Underlying</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{underlying}</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              className={`circuit-breaker-indicator ${automationEnabled ? 'active' : 'inactive'}`}
              style={{ cursor: 'pointer', userSelect: 'none' }}
              onClick={() => setAutomationEnabled((v) => !v)}
            >
              <div className="cb-dot" />
              {automationEnabled ? 'AUTO ON' : 'AUTO OFF'}
            </div>
          </div>
        </div>
        {autoPilotWarning && (
          <div style={{
            marginTop: 12, padding: '8px 12px',
            background: 'rgba(var(--neg-rgb,220,50,50),0.1)',
            border: '1px solid var(--neg)',
            borderRadius: 6, fontSize: 13, color: 'var(--neg)',
          }}>
            Warning: Low confidence ({confidence.toFixed(0)}%) with automation enabled. Consider increasing threshold or disabling automation.
          </div>
        )}
      </div>

      {/* Risk Profile */}
      <div className="risk-profile-card" style={{ marginBottom: 20 }}>
        <div className="analytics-group-title" style={{ marginBottom: 12 }}>Risk Profile</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          <RiskField
            label="Max Loss / Trade"
            value={risk.max_loss_per_trade}
            onChange={(v) => updateRisk('max_loss_per_trade', v)}
            prefix="₹"
            step={500}
          />
          <RiskField
            label="Max Daily Loss"
            value={risk.max_daily_loss}
            onChange={(v) => updateRisk('max_daily_loss', v)}
            prefix="₹"
            step={1000}
          />
          <RiskField
            label="Position Size"
            value={risk.position_size_lots}
            onChange={(v) => updateRisk('position_size_lots', v)}
            suffix="lots"
            min={1}
          />
          <RiskField
            label="Stop Loss"
            value={risk.stop_loss_pct}
            onChange={(v) => updateRisk('stop_loss_pct', v)}
            suffix="%"
            step={5}
          />
          <RiskField
            label="Target"
            value={risk.target_pct}
            onChange={(v) => updateRisk('target_pct', v)}
            suffix="%"
            step={5}
          />
          <RiskField
            label="Time Stop"
            value={risk.time_stop_minutes}
            onChange={(v) => updateRisk('time_stop_minutes', v)}
            suffix="min"
            step={15}
          />
        </div>
      </div>

      {/* Circuit Breaker */}
      <div className="risk-profile-card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="analytics-group-title">Circuit Breaker</div>
          <div
            className={`circuit-breaker-indicator ${cb.enabled ? (cb.active ? 'tripped' : 'active') : 'inactive'}`}
            style={{ cursor: 'pointer' }}
            onClick={() => setCb((c) => ({ ...c, enabled: !c.enabled }))}
          >
            <div className="cb-dot" />
            {cb.active ? 'TRIPPED' : cb.enabled ? 'ARMED' : 'DISABLED'}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          <RiskField
            label="Max Consecutive Losses"
            value={cb.max_consecutive_losses}
            onChange={(v) => setCb((c) => ({ ...c, max_consecutive_losses: v }))}
            min={1}
          />
          <RiskField
            label="Daily P&L Floor"
            value={cb.daily_pnl_floor}
            onChange={(v) => setCb((c) => ({ ...c, daily_pnl_floor: v }))}
            prefix="₹"
            step={1000}
          />
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--fg-faint)' }}>
          Circuit breaker halts all automation if triggered. Manual override required to resume.
        </div>
      </div>

      {/* Save */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
        <button className="btn-primary" onClick={saveRisk} disabled={saving}>
          {saving ? 'Saving…' : 'Save Configuration'}
        </button>
        {saveMsg && (
          <span style={{ fontSize: 13, color: 'var(--accent)' }}>{saveMsg}</span>
        )}
      </div>

      {/* Execute Trade */}
      <div className="risk-profile-card" style={{ marginBottom: 20 }}>
        <div className="analytics-group-title" style={{ marginBottom: 12 }}>Execute Trade</div>
        {atmStrike ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13 }}>
              <span style={{ color: 'var(--fg-faint)' }}>Proposed: </span>
              <strong style={{ color: proposedSide === 'ORDER_SIDE_SELL' ? 'var(--neg)' : 'var(--pos)' }}>
                SELL
              </strong>{' '}
              <strong>{underlying} {atmStrike} {proposedOptionType}</strong>
              {' × '}
              <strong>{risk.position_size_lots} lot{risk.position_size_lots > 1 ? 's' : ''}</strong>
              {proposedLtp > 0 && (
                <span style={{ color: 'var(--fg-faint)' }}> @ ₹{proposedLtp.toFixed(1)} LTP</span>
              )}
            </div>
            <button
              className="btn-primary"
              onClick={executeNow}
              disabled={executing || !automationEnabled}
              style={{ background: automationEnabled ? 'var(--neg)' : undefined, opacity: automationEnabled ? 1 : 0.5 }}
            >
              {executing ? 'Placing…' : 'Execute Now'}
            </button>
            {!automationEnabled && (
              <span style={{ fontSize: 12, color: 'var(--fg-faint)' }}>Enable automation above first</span>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--fg-faint)' }}>
            Waiting for live chain data (ATM strike)…
          </div>
        )}
        {execMsg && (
          <div style={{
            marginTop: 10, padding: '8px 12px',
            background: execMsg.ok ? 'rgba(34,197,94,0.08)' : 'rgba(220,50,50,0.08)',
            border: `1px solid ${execMsg.ok ? 'var(--pos)' : 'var(--neg)'}`,
            borderRadius: 6, fontSize: 13,
            color: execMsg.ok ? 'var(--pos)' : 'var(--neg)',
          }}>
            {execMsg.text}
          </div>
        )}
      </div>

      {/* Execution History */}
      {executions.length > 0 && (
        <div className="risk-profile-card" style={{ marginBottom: 20 }}>
          <div className="analytics-group-title" style={{ marginBottom: 12 }}>Recent Executions</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: 'var(--fg-faint)', textAlign: 'left' }}>
                  <th style={{ padding: '4px 8px', fontWeight: 500 }}>Time</th>
                  <th style={{ padding: '4px 8px', fontWeight: 500 }}>Instrument</th>
                  <th style={{ padding: '4px 8px', fontWeight: 500 }}>Side</th>
                  <th style={{ padding: '4px 8px', fontWeight: 500 }}>Qty</th>
                  <th style={{ padding: '4px 8px', fontWeight: 500 }}>Price</th>
                  <th style={{ padding: '4px 8px', fontWeight: 500 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {executions.map((ex) => (
                  <tr key={ex.id} style={{ borderTop: '1px solid var(--hairline)' }}>
                    <td style={{ padding: '4px 8px', color: 'var(--fg-faint)' }}>
                      {ex.executed_at.replace('T', ' ').slice(0, 16)}
                    </td>
                    <td style={{ padding: '4px 8px' }}>{ex.instrument_display_name}</td>
                    <td style={{ padding: '4px 8px', color: ex.order_side.includes('SELL') ? 'var(--neg)' : 'var(--pos)' }}>
                      {ex.order_side.includes('SELL') ? 'SELL' : 'BUY'}
                    </td>
                    <td style={{ padding: '4px 8px' }}>{ex.order_qty}</td>
                    <td style={{ padding: '4px 8px' }}>₹{ex.limit_price?.toFixed(1)}</td>
                    <td style={{ padding: '4px 8px' }}>
                      <span style={{
                        padding: '1px 6px', borderRadius: 3, fontSize: 11,
                        background: ex.status === 'placed' ? 'rgba(34,197,94,0.12)' : 'rgba(220,50,50,0.12)',
                        color: ex.status === 'placed' ? 'var(--pos)' : 'var(--neg)',
                      }}>
                        {ex.status === 'placed' ? (ex.order_status || 'SENT') : 'FAILED'}
                      </span>
                      {ex.error_message && (
                        <span style={{ marginLeft: 6, color: 'var(--neg)', fontSize: 11 }}>{ex.error_message.slice(0, 40)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--fg-faint)', lineHeight: 1.6, padding: '12px 0', borderTop: '1px solid var(--hairline)' }}>
        Automation executes trades through your connected Nubra broker. Circuit breaker halts execution after reaching the loss limit. Always monitor positions manually.
      </div>
    </div>
  )
}
