import { useState } from 'react'
import type { LivePosition, AdviceStatus } from './usePositionTracker'

interface Props {
  positions: LivePosition[]
  onRemove: (id: string) => void
  onApplySl: (id: string, sl: number) => void
  onApplyTarget: (id: string, target: number) => void
  inline?: boolean  // renders as tab content (no outer panel chrome, always expanded)
}

const ADVICE_CFG: Record<AdviceStatus, { color: string; bg: string; label: string }> = {
  HOLD:         { color: 'rgb(148,163,184)', bg: 'rgba(148,163,184,0.12)', label: 'HOLD' },
  WATCH:        { color: 'rgb(251,191,36)',  bg: 'rgba(251,191,36,0.12)',  label: 'WATCH' },
  TRAIL_SL:     { color: 'rgb(96,165,250)',  bg: 'rgba(96,165,250,0.12)', label: 'TRAIL SL' },
  BOOK_PARTIAL: { color: 'rgb(251,146,60)',  bg: 'rgba(251,146,60,0.12)', label: 'BOOK ½' },
  EXIT_NOW:     { color: 'rgb(239,68,68)',   bg: 'rgba(239,68,68,0.15)',  label: 'EXIT NOW' },
  COVER_NOW:    { color: 'rgb(239,68,68)',   bg: 'rgba(239,68,68,0.15)',  label: 'COVER NOW' },
}

function fmtPnl(n: number): string {
  const abs = Math.abs(Math.round(n))
  const sign = n >= 0 ? '+' : '−'
  return `${sign}₹${abs.toLocaleString('en-IN')}`
}

export default function PositionTrackerPanel({ positions, onRemove, onApplySl, onApplyTarget, inline }: Props) {
  const [collapsed, setCollapsed] = useState(false)

  if (positions.length === 0) {
    return inline ? (
      <div className="oie-loading" style={{ minHeight: 200 }}>
        No tracked positions yet — hover a strike in the Chain tab and click + CE / + PE to start tracking.
      </div>
    ) : null
  }

  const alertCount = positions.filter(p => p.urgency === 'high').length

  // In inline (tab) mode: render directly without the outer panel chrome
  const list = (
    <div className={inline ? 'ptp-list-inline' : 'ptp-list'}>
      {positions.map(pos => {
            const cfg = ADVICE_CFG[pos.advice]
            const isHigh = pos.urgency === 'high'
            const isBuy = pos.action === 'BUY'
            const pnlPositive = pos.pnlPerLot != null && pos.pnlPerLot * pos.lots >= 0
            const optColor = pos.optionType === 'CE' ? 'rgba(120,201,255,0.9)' : 'rgba(241,66,66,0.9)'
            const actionColor = isBuy ? 'rgb(34,197,94)' : 'rgb(239,68,68)'
            const totalPnl = pos.pnlPerLot != null ? pos.pnlPerLot * pos.lots : null

            return (
              <div key={pos.id} className={`ptp-row${isHigh ? ' ptp-row-alert' : ''}`}>
                {/* Position identity */}
                <div className="ptp-pos-info">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: optColor }}>
                      {pos.underlying} {pos.strike} {pos.optionType}
                    </span>
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                      padding: '1px 5px', borderRadius: 3,
                      background: isBuy ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                      color: actionColor,
                    }}>{pos.action}</span>
                    {pos.expiry && pos.expiry.length >= 8 && (
                      <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>
                        {pos.expiry.slice(4, 6)}/{pos.expiry.slice(6, 8)}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--fg-faint)', lineHeight: 1.6 }}>
                    Entry ₹{pos.entryPrice.toFixed(1)}
                    <span style={{ margin: '0 4px', opacity: 0.4 }}>·</span>
                    SL ₹{pos.slPrice.toFixed(1)}
                    <span style={{ margin: '0 4px', opacity: 0.4 }}>·</span>
                    Target ₹{pos.targetPrice.toFixed(1)}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--fg-faint)', marginTop: 2 }}>
                    {pos.lots} lot{pos.lots > 1 ? 's' : ''} · lot size {pos.lotSize}
                  </div>
                </div>

                {/* Live LTP + P&L */}
                <div className="ptp-pnl-info">
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 3 }}>
                    {pos.currentLtp != null ? `₹${pos.currentLtp.toFixed(1)}` : '—'}
                  </div>
                  {totalPnl != null && (
                    <>
                      <div style={{
                        fontSize: 12, fontWeight: 700,
                        color: pnlPositive ? 'var(--pos)' : 'var(--neg)',
                      }}>
                        {fmtPnl(totalPnl)}
                      </div>
                      {pos.pnlPct != null && (
                        <div style={{
                          fontSize: 10,
                          color: pnlPositive ? 'var(--pos)' : 'var(--neg)',
                          opacity: 0.8,
                        }}>
                          {pos.pnlPct >= 0 ? '+' : ''}{pos.pnlPct.toFixed(1)}%
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Advice badge + reason + actions */}
                <div className="ptp-advice-section">
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '4px 10px', borderRadius: 4, marginBottom: 6,
                    background: cfg.bg, border: `1px solid ${cfg.color}55`,
                  }}>
                    {isHigh && (
                      <span style={{
                        color: cfg.color, fontSize: 9,
                        animation: 'ptp-pulse 1.2s ease-in-out infinite',
                      }}>●</span>
                    )}
                    <span style={{
                      fontSize: 11, fontWeight: 700, letterSpacing: '0.07em',
                      color: cfg.color,
                    }}>{cfg.label}</span>
                  </div>
                  <div style={{
                    fontSize: 11, color: 'var(--fg-faint)', lineHeight: 1.5,
                    marginBottom: pos.suggestedSl != null || pos.suggestedTarget != null ? 8 : 8,
                    maxWidth: 320,
                  }}>
                    {pos.adviceReason}
                  </div>

                  {/* Suggested SL — shown prominently when present */}
                  {(pos.suggestedSl != null || pos.suggestedTarget != null) && (
                    <div style={{
                      display: 'flex', flexDirection: 'column', gap: 4,
                      padding: '8px 10px', borderRadius: 5, marginBottom: 8,
                      background: 'rgba(96,165,250,0.07)',
                      border: '1px solid rgba(96,165,250,0.2)',
                    }}>
                      {pos.suggestedSl != null && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 10, color: 'var(--fg-faint)', whiteSpace: 'nowrap' }}>
                            If holding →
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'rgb(96,165,250)' }}>
                            SL ₹{pos.suggestedSl}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>
                            (was ₹{pos.slPrice.toFixed(1)})
                          </span>
                          <button
                            style={{
                              marginLeft: 'auto', fontSize: 10, padding: '2px 8px',
                              borderRadius: 3, border: '1px solid rgba(96,165,250,0.4)',
                              background: 'rgba(96,165,250,0.12)', color: 'rgb(96,165,250)',
                              cursor: 'pointer',
                            }}
                            onClick={() => onApplySl(pos.id, pos.suggestedSl!)}
                          >
                            Apply
                          </button>
                        </div>
                      )}
                      {pos.suggestedTarget != null && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 10, color: 'var(--fg-faint)', whiteSpace: 'nowrap' }}>
                            Revised target →
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'rgb(251,146,60)' }}>
                            ₹{pos.suggestedTarget}
                          </span>
                          <button
                            style={{
                              marginLeft: 'auto', fontSize: 10, padding: '2px 8px',
                              borderRadius: 3, border: '1px solid rgba(251,146,60,0.4)',
                              background: 'rgba(251,146,60,0.12)', color: 'rgb(251,146,60)',
                              cursor: 'pointer',
                            }}
                            onClick={() => onApplyTarget(pos.id, pos.suggestedTarget!)}
                          >
                            Apply
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    className="btn-sm"
                    style={{ fontSize: 10, color: 'var(--neg)', borderColor: 'rgba(239,68,68,0.25)' }}
                    onClick={() => onRemove(pos.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            )
          })}
    </div>
  )

  if (inline) return list

  return (
    <div className="ptp-root">
      <div className="ptp-header" onClick={() => setCollapsed(v => !v)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="ptp-title">Position Tracker</span>
          <span className="ptp-count">{positions.length}</span>
          {alertCount > 0 && (
            <span className="ptp-alert-badge">
              {alertCount} alert{alertCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <span style={{ fontSize: 11, color: 'var(--fg-faint)', userSelect: 'none' }}>
          {collapsed ? '▲' : '▼'}
        </span>
      </div>
      {!collapsed && list}
    </div>
  )
}
