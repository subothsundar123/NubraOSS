import { useState, useEffect } from 'react'
import type { TrackedPosition, TradeAction } from './usePositionTracker'
import type { TrackRequest } from './ChainTab'

interface Props {
  request: TrackRequest | null
  onConfirm: (pos: Omit<TrackedPosition, 'id' | 'addedAt'>) => void
  onClose: () => void
}

function r1(n: number) { return Math.round(n * 10) / 10 }

function defaultSl(action: TradeAction, entry: number): number {
  return r1(action === 'BUY' ? entry * 0.70 : entry * 1.50)
}

function defaultTarget(action: TradeAction, entry: number): number {
  return r1(action === 'BUY' ? entry * 1.60 : entry * 0.30)
}

export default function AddPositionModal({ request, onConfirm, onClose }: Props) {
  const [action, setAction] = useState<TradeAction>('BUY')
  const [entryStr, setEntryStr] = useState('')
  const [lotsStr, setLotsStr] = useState('1')
  const [slStr, setSlStr] = useState('')
  const [targetStr, setTargetStr] = useState('')
  const [slManual, setSlManual] = useState(false)
  const [targetManual, setTargetManual] = useState(false)

  useEffect(() => {
    if (!request) return
    const entry = request.ltp
    setAction('BUY')
    setEntryStr(String(r1(entry)))
    setLotsStr('1')
    setSlStr(String(defaultSl('BUY', entry)))
    setTargetStr(String(defaultTarget('BUY', entry)))
    setSlManual(false)
    setTargetManual(false)
  }, [request])

  // Auto-recompute SL/target when action or entry changes (unless user overrode them)
  useEffect(() => {
    const entry = parseFloat(entryStr)
    if (isNaN(entry) || entry <= 0) return
    if (!slManual) setSlStr(String(defaultSl(action, entry)))
    if (!targetManual) setTargetStr(String(defaultTarget(action, entry)))
  }, [action, entryStr]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!request) return null
  const trackedRequest = request

  const entry = parseFloat(entryStr)
  const lots = parseInt(lotsStr) || 1
  const sl = parseFloat(slStr)
  const target = parseFloat(targetStr)
  const isValid = !isNaN(entry) && entry > 0 && !isNaN(sl) && !isNaN(target) && lots >= 1

  function handleConfirm() {
    if (!isValid) return
    onConfirm({
      underlying: trackedRequest.underlying,
      expiry: trackedRequest.expiry,
      strike: trackedRequest.strike,
      optionType: trackedRequest.optionType,
      action,
      entryPrice: r1(entry),
      lots,
      lotSize: trackedRequest.lotSize,
      slPrice: r1(sl),
      targetPrice: r1(target),
    })
    onClose()
  }

  const isBuy = action === 'BUY'
  const optColor = request.optionType === 'CE' ? 'rgb(120,201,255)' : 'rgb(241,66,66)'

  return (
    <div className="apm-overlay" onClick={onClose}>
      <div className="apm-dialog" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="apm-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: optColor }}>
              {request.underlying} {request.strike} {request.optionType}
            </span>
            {request.expiry && request.expiry.length >= 8 && (
              <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>
                exp {request.expiry.slice(0, 4)}-{request.expiry.slice(4, 6)}-{request.expiry.slice(6, 8)}
              </span>
            )}
          </div>
          <button className="apm-close" onClick={onClose}>✕</button>
        </div>

        {/* Action toggle */}
        <div className="apm-field">
          <label className="apm-label">Action</label>
          <div className="apm-toggle-group">
            <button
              className={`apm-toggle${action === 'BUY' ? ' active buy' : ''}`}
              onClick={() => setAction('BUY')}
            >BUY</button>
            <button
              className={`apm-toggle${action === 'SELL' ? ' active sell' : ''}`}
              onClick={() => setAction('SELL')}
            >SELL</button>
          </div>
        </div>

        {/* Entry + Lots */}
        <div className="apm-row-2">
          <div className="apm-field">
            <label className="apm-label">Entry Price ₹</label>
            <input
              className="apm-input"
              type="number"
              step="0.1"
              min="0.1"
              value={entryStr}
              onChange={e => setEntryStr(e.target.value)}
            />
          </div>
          <div className="apm-field">
            <label className="apm-label">Lots (lot size: {request.lotSize})</label>
            <input
              className="apm-input"
              type="number"
              min="1"
              step="1"
              value={lotsStr}
              onChange={e => setLotsStr(e.target.value)}
            />
          </div>
        </div>

        {/* SL + Target */}
        <div className="apm-row-2">
          <div className="apm-field">
            <label className="apm-label">{isBuy ? 'Stop Loss ₹' : 'Stop Loss (1.5×) ₹'}</label>
            <input
              className="apm-input"
              type="number"
              step="0.1"
              value={slStr}
              onChange={e => { setSlStr(e.target.value); setSlManual(true) }}
              style={{ borderColor: slManual ? 'rgba(251,191,36,0.5)' : undefined }}
            />
          </div>
          <div className="apm-field">
            <label className="apm-label">{isBuy ? 'Target ₹' : 'Target (0.3×) ₹'}</label>
            <input
              className="apm-input"
              type="number"
              step="0.1"
              value={targetStr}
              onChange={e => { setTargetStr(e.target.value); setTargetManual(true) }}
              style={{ borderColor: targetManual ? 'rgba(251,191,36,0.5)' : undefined }}
            />
          </div>
        </div>

        {/* Risk/reward hint */}
        {isValid && (
          <div className="apm-hint">
            {isBuy ? (
              <>
                Risk ₹{r1(entry - sl).toFixed(1)} ({r1((entry - sl) / entry * 100).toFixed(1)}%) ·{' '}
                Reward ₹{r1(target - entry).toFixed(1)} ({r1((target - entry) / entry * 100).toFixed(1)}%) ·{' '}
                RR {r1((target - entry) / Math.max(entry - sl, 0.1)).toFixed(1)}:1
              </>
            ) : (
              <>
                Target at ₹{target.toFixed(1)} ({r1((entry - target) / entry * 100).toFixed(1)}% decay) ·{' '}
                SL at ₹{sl.toFixed(1)} ({r1((sl - entry) / entry * 100).toFixed(1)}% above entry)
              </>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="apm-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!isValid} onClick={handleConfirm}>
            Track Position
          </button>
        </div>
      </div>
    </div>
  )
}
