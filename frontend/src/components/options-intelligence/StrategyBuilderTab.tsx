import { useState, useCallback, useEffect } from 'react'

interface Condition {
  id: string
  metric: string
  operator: string
  value: string
}

interface ConditionGroup {
  id: string
  logic: 'AND' | 'OR'
  conditions: Condition[]
}

interface Strategy {
  id: string
  name: string
  underlying: string
  groups: ConditionGroup[]
  action: 'alert' | 'execute'
  saved: boolean
}

const METRIC_OPTIONS = [
  { value: 'pcr', label: 'PCR (OI)', group: 'OI' },
  { value: 'dynamic_pcr', label: 'Dynamic PCR (Volume)', group: 'OI' },
  { value: 'oi_momentum', label: 'OI Momentum', group: 'OI' },
  { value: 'oi_concentration', label: 'OI Concentration %', group: 'OI' },
  { value: 'oi_imbalance', label: 'OI Imbalance %', group: 'OI' },
  { value: 'call_wall', label: 'Call Wall (strike)', group: 'OI' },
  { value: 'put_wall', label: 'Put Wall (strike)', group: 'OI' },
  { value: 'max_pain', label: 'Max Pain (strike)', group: 'OI' },
  { value: 'atm_iv', label: 'ATM IV %', group: 'Volatility' },
  { value: 'iv_rank', label: 'IV Rank', group: 'Volatility' },
  { value: 'iv_percentile', label: 'IV Percentile', group: 'Volatility' },
  { value: 'iv_skew', label: 'IV Skew', group: 'Volatility' },
  { value: 'expected_move', label: 'Expected Move %', group: 'Volatility' },
  { value: 'gex', label: 'Gamma Exposure (GEX)', group: 'Dealer' },
  { value: 'gamma_flip', label: 'Gamma Flip Level', group: 'Dealer' },
  { value: 'vanna_exposure', label: 'Vanna Exposure', group: 'Dealer' },
  { value: 'charm_exposure', label: 'Charm Exposure', group: 'Dealer' },
]

const OPERATORS = ['>', '<', '>=', '<=', '=', 'crosses above', 'crosses below']

function newCondition(): Condition {
  return { id: crypto.randomUUID(), metric: 'pcr', operator: '>', value: '1.0' }
}

function newGroup(): ConditionGroup {
  return { id: crypto.randomUUID(), logic: 'AND', conditions: [newCondition()] }
}

function newStrategy(): Strategy {
  return {
    id: crypto.randomUUID(),
    name: 'New Strategy',
    underlying: 'NIFTY',
    groups: [newGroup()],
    action: 'alert',
    saved: false,
  }
}

interface Props {
  sessionToken: string
  deviceId: string
  environment: string
  currentMetrics?: Record<string, { value: number | null; formatted: string }>
}

export default function StrategyBuilderTab({ sessionToken, deviceId, environment, currentMetrics = {} }: Props) {
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [editing, setEditing] = useState<Strategy | null>(null)
  const [saving, setSaving] = useState(false)
  const [selectedUnderlying, setSelectedUnderlying] = useState('NIFTY')

  // Load saved strategies when underlying changes
  useEffect(() => {
    fetch(`/api/oie/strategy/list?underlying=${selectedUnderlying}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.strategies) {
          const loaded: Strategy[] = data.strategies.map((s: {
            id: string; name: string; underlying: string;
            action: string; entry_conditions: unknown[]
          }) => ({
            id: s.id, name: s.name, underlying: s.underlying,
            action: s.action as 'alert' | 'execute',
            groups: (s.entry_conditions || []) as ConditionGroup[],
            saved: true,
          }))
          setStrategies(loaded)
        }
      })
      .catch(() => {})
  }, [selectedUnderlying])

  const createNew = () => {
    const s = { ...newStrategy(), underlying: selectedUnderlying }
    setEditing(s)
  }

  const addGroup = () => {
    if (!editing) return
    setEditing({ ...editing, groups: [...editing.groups, newGroup()] })
  }

  const addCondition = (groupId: string) => {
    if (!editing) return
    setEditing({
      ...editing,
      groups: editing.groups.map((g) =>
        g.id === groupId ? { ...g, conditions: [...g.conditions, newCondition()] } : g
      ),
    })
  }

  const updateCondition = (groupId: string, condId: string, field: keyof Condition, val: string) => {
    if (!editing) return
    setEditing({
      ...editing,
      groups: editing.groups.map((g) =>
        g.id === groupId
          ? {
              ...g,
              conditions: g.conditions.map((c) =>
                c.id === condId ? { ...c, [field]: val } : c
              ),
            }
          : g
      ),
    })
  }

  const removeCondition = (groupId: string, condId: string) => {
    if (!editing) return
    setEditing({
      ...editing,
      groups: editing.groups.map((g) =>
        g.id === groupId
          ? { ...g, conditions: g.conditions.filter((c) => c.id !== condId) }
          : g
      ).filter((g) => g.conditions.length > 0),
    })
  }

  const toggleGroupLogic = (groupId: string) => {
    if (!editing) return
    setEditing({
      ...editing,
      groups: editing.groups.map((g) =>
        g.id === groupId ? { ...g, logic: g.logic === 'AND' ? 'OR' : 'AND' } : g
      ),
    })
  }

  // Live match preview
  const computeMatch = useCallback((strategy: Strategy) => {
    let total = 0
    let matched = 0
    strategy.groups.forEach((g) => {
      g.conditions.forEach((c) => {
        total++
        const metricVal = currentMetrics[c.metric]?.value
        if (metricVal == null) return
        const condVal = parseFloat(c.value)
        if (isNaN(condVal)) return
        let pass = false
        switch (c.operator) {
          case '>': pass = metricVal > condVal; break
          case '<': pass = metricVal < condVal; break
          case '>=': pass = metricVal >= condVal; break
          case '<=': pass = metricVal <= condVal; break
          case '=': pass = Math.abs(metricVal - condVal) < 0.001; break
          default: pass = false
        }
        if (pass) matched++
      })
    })
    return { matched, total, pct: total > 0 ? Math.round(matched / total * 100) : 0 }
  }, [currentMetrics])

  const saveStrategy = async () => {
    if (!editing) return
    setSaving(true)
    try {
      const res = await fetch('/api/oie/strategy/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_token: sessionToken,
          id: editing.id,
          name: editing.name,
          underlying: editing.underlying,
          entry_conditions: editing.groups,
          action: editing.action,
        }),
      })
      if (res.ok) {
        const saved = { ...editing, saved: true }
        setStrategies((prev) => {
          const existing = prev.findIndex((s) => s.id === editing.id)
          if (existing >= 0) return prev.map((s, i) => i === existing ? saved : s)
          return [...prev, saved]
        })
        setEditing(null)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="strategy-builder-wrap">
      {/* Underlying filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--fg-faint)' }}>Underlying:</span>
        {['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX'].map(u => (
          <button key={u}
            className={`oie-underlying-btn${selectedUnderlying === u ? ' active' : ''}`}
            onClick={() => setSelectedUnderlying(u)}
          >{u}</button>
        ))}
      </div>

      {/* Strategy List */}
      {strategies.length > 0 && (
        <div>
          <div className="analytics-group-title" style={{ marginBottom: 12 }}>Saved Strategies</div>
          <div className="strategy-list">
            {strategies.map((s) => {
              const match = computeMatch(s)
              return (
                <div key={s.id} className="strategy-item">
                  <div>
                    <div className="strategy-item-name">{s.name}</div>
                    <div className="strategy-item-meta">
                      {s.underlying} · {s.groups.reduce((a, g) => a + g.conditions.length, 0)} conditions · {s.action}
                      {' · '}
                      <span style={{ color: 'var(--accent)' }}>
                        {match.pct}% match ({match.matched}/{match.total})
                      </span>
                    </div>
                  </div>
                  <div className="strategy-item-actions">
                    <button className="btn-sm" onClick={() => setEditing(s)}>Edit</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!editing ? (
        <button
          className="btn-primary"
          onClick={createNew}
          style={{ marginTop: 8 }}
        >
          + New Strategy
        </button>
      ) : (
        <div>
          <div className="condition-builder">
            {/* Strategy meta */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              <input
                className="condition-value-input"
                style={{ width: 200 }}
                placeholder="Strategy name"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
              <select
                className="condition-select"
                value={editing.underlying}
                onChange={(e) => setEditing({ ...editing, underlying: e.target.value })}
              >
                {['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX'].map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
              <select
                className="condition-select"
                value={editing.action}
                onChange={(e) => setEditing({ ...editing, action: e.target.value as 'alert' | 'execute' })}
              >
                <option value="alert">Alert Only</option>
                <option value="execute">Execute Trade</option>
              </select>
            </div>

            {/* Condition Groups */}
            {editing.groups.map((group, gi) => (
              <div key={group.id} style={{ marginBottom: 12 }}>
                {gi > 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--fg-faint)', fontSize: 11, margin: '8px 0' }}>
                    — GROUP {gi + 1} —
                  </div>
                )}
                {group.conditions.map((cond, ci) => (
                  <div key={cond.id} className="condition-row">
                    {ci > 0 && (
                      <button
                        className="condition-logic-toggle"
                        onClick={() => toggleGroupLogic(group.id)}
                      >
                        {group.logic}
                      </button>
                    )}
                    <select
                      className="condition-select"
                      value={cond.metric}
                      onChange={(e) => updateCondition(group.id, cond.id, 'metric', e.target.value)}
                    >
                      {METRIC_OPTIONS.map((m) => (
                        <option key={m.value} value={m.value}>{m.group}: {m.label}</option>
                      ))}
                    </select>
                    <select
                      className="condition-select"
                      value={cond.operator}
                      onChange={(e) => updateCondition(group.id, cond.id, 'operator', e.target.value)}
                    >
                      {OPERATORS.map((op) => (
                        <option key={op} value={op}>{op}</option>
                      ))}
                    </select>
                    <input
                      className="condition-value-input"
                      value={cond.value}
                      onChange={(e) => updateCondition(group.id, cond.id, 'value', e.target.value)}
                      placeholder="value"
                    />
                    {currentMetrics[cond.metric] && (
                      <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>
                        now: {currentMetrics[cond.metric].formatted}
                      </span>
                    )}
                    <button
                      onClick={() => removeCondition(group.id, cond.id)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--neg)', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button className="condition-add-btn" onClick={() => addCondition(group.id)}>
                  + Add condition
                </button>
              </div>
            ))}

            <button
              className="condition-add-btn"
              onClick={addGroup}
              style={{ marginTop: 4, borderColor: 'var(--accent)', color: 'var(--accent)' }}
            >
              + Add condition group (OR)
            </button>

            {/* Live match preview */}
            {Object.keys(currentMetrics).length > 0 && (() => {
              const { matched, total, pct } = computeMatch(editing)
              return (
                <div style={{ marginTop: 14 }}>
                  <div className="condition-match-bar">
                    <div className="condition-match-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="condition-match-label">
                    Live match: {matched}/{total} conditions ({pct}%)
                  </div>
                </div>
              )
            })()}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-primary" onClick={saveStrategy} disabled={saving}>
              {saving ? 'Saving…' : 'Save Strategy'}
            </button>
            <button className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
