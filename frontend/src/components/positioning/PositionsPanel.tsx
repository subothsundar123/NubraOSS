import { useState, useEffect, useCallback } from 'react'

type Env = 'PROD' | 'UAT'

interface Session {
  access_token: string
  device_id: string
  environment: Env
}

interface PositionItem {
  ref_id: number
  display_name: string
  underlying: string
  strike_price: number | null
  option_type: string | null
  lot_size: number
  qty: number
  avg_price: number
  ltp: number
  pnl: number
  pnl_pct: number | null
  product: string
  side: string
  expiry: string | null
  zanskar_name: string | null
}

interface PositionsData {
  positions: PositionItem[]
  total_pnl: number
}

interface PositionsPanelProps {
  session: Session
  executionSession?: Session | null
}

const POLL_MS = 8_000

function fmt2(v: number) {
  return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function pnlClass(v: number) {
  if (v > 0) return 'pos-text'
  if (v < 0) return 'neg-text'
  return ''
}

function sideLabel(side: string) {
  if (side === 'BUY' || side === 'ORDER_SIDE_BUY') return 'BUY'
  if (side === 'SELL' || side === 'ORDER_SIDE_SELL') return 'SELL'
  return side
}

function productLabel(p: string) {
  if (p.includes('IDAY')) return 'MIS'
  if (p.includes('CNC') || p.includes('NRML')) return 'NRML'
  return p.replace('ORDER_DELIVERY_TYPE_', '')
}

export default function PositionsPanel({ session, executionSession }: PositionsPanelProps) {
  const [data, setData] = useState<PositionsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exiting, setExiting] = useState<number | null>(null)
  const [exitError, setExitError] = useState<{ ref_id: number; msg: string } | null>(null)
  const [exitSuccess, setExitSuccess] = useState<number | null>(null)

  const activeSession = executionSession ?? session

  const fetchPositions = useCallback((showLoading = false) => {
    if (showLoading) setLoading(true)
    fetch('/api/positioning/positions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_token: activeSession.access_token,
        device_id: activeSession.device_id,
        environment: activeSession.environment,
      }),
    })
      .then(async (r) => {
        const payload = await r.json() as PositionsData & { detail?: unknown }
        if (!r.ok) {
          const d = payload.detail
          setError(typeof d === 'string' ? d : 'Failed to load positions')
        } else {
          setData(payload)
          setError(null)
        }
      })
      .catch(() => setError('Network error fetching positions'))
      .finally(() => setLoading(false))
  }, [activeSession.access_token, activeSession.device_id, activeSession.environment])

  useEffect(() => {
    fetchPositions(true)
    const id = setInterval(() => fetchPositions(false), POLL_MS)
    return () => clearInterval(id)
  }, [fetchPositions])

  const handleExit = async (pos: PositionItem) => {
    setExiting(pos.ref_id)
    setExitError(null)
    setExitSuccess(null)
    // Exit side is opposite of position side
    const exitSide = (pos.side === 'BUY' || pos.side === 'ORDER_SIDE_BUY')
      ? 'ORDER_SIDE_SELL'
      : 'ORDER_SIDE_BUY'
    const deliveryType = pos.product.includes('IDAY')
      ? 'ORDER_DELIVERY_TYPE_IDAY'
      : 'ORDER_DELIVERY_TYPE_CNC'

    try {
      const res = await fetch('/api/positioning/exit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_token: activeSession.access_token,
          device_id: activeSession.device_id,
          environment: activeSession.environment,
          ref_id: pos.ref_id,
          display_name: pos.display_name,
          option_leg: pos.option_type ?? 'CE',
          exit_side: exitSide,
          qty: pos.qty,
          lot_size: pos.lot_size,
          ltp: pos.ltp,
          order_delivery_type: deliveryType,
        }),
      })
      const body = await res.json() as Record<string, unknown>
      if (!res.ok) {
        const d = body.detail
        const msg = typeof d === 'string' ? d
          : (d && typeof d === 'object' ? ((d as Record<string, unknown>).error ?? (d as Record<string, unknown>).message) as string ?? JSON.stringify(d) : 'Exit failed')
        setExitError({ ref_id: pos.ref_id, msg: String(msg) })
      } else {
        setExitSuccess(pos.ref_id)
        setTimeout(() => {
          setExitSuccess(null)
          fetchPositions(false)
        }, 2000)
      }
    } catch {
      setExitError({ ref_id: pos.ref_id, msg: 'Network error' })
    } finally {
      setExiting(null)
    }
  }

  if (loading && !data) {
    return <div className="pos-panel-empty">Loading positions…</div>
  }

  if (error && !data) {
    return <div className="pos-panel-empty neg-text">{error}</div>
  }

  const positions = data?.positions ?? []

  return (
    <div className="pos-panel">
      <div className="pos-panel-header">
        <span className="pos-panel-title">Open Positions</span>
        <span className="pos-panel-env">{activeSession.environment}</span>
        {data && (
          <span className={`pos-panel-total ${pnlClass(data.total_pnl)}`}>
            Total P&L: {data.total_pnl >= 0 ? '+' : ''}₹{fmt2(data.total_pnl)}
          </span>
        )}
        <button className="pos-refresh-btn" onClick={() => fetchPositions(false)} title="Refresh">↻</button>
      </div>

      {positions.length === 0 ? (
        <div className="pos-panel-empty">No open option positions</div>
      ) : (
        <div className="pos-table-wrap">
          <table className="pos-table">
            <thead>
              <tr>
                <th>Instrument</th>
                <th>Side</th>
                <th>Qty</th>
                <th>Avg</th>
                <th>LTP</th>
                <th>P&L</th>
                <th>%</th>
                <th>Product</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos) => {
                const isExiting = exiting === pos.ref_id
                const isSuccess = exitSuccess === pos.ref_id
                const err = exitError?.ref_id === pos.ref_id ? exitError.msg : null
                const side = sideLabel(pos.side)
                return (
                  <tr key={pos.ref_id} className={isSuccess ? 'pos-row-success' : ''}>
                    <td className="pos-instrument">
                      <span className="pos-name">{pos.display_name}</span>
                      {pos.option_type && (
                        <span className={`pos-opt-badge ${pos.option_type === 'CE' ? 'ce' : 'pe'}`}>
                          {pos.option_type}
                        </span>
                      )}
                    </td>
                    <td className={`pos-side ${side === 'BUY' ? 'pos-text' : 'neg-text'}`}>{side}</td>
                    <td className="pos-num">{pos.qty}</td>
                    <td className="pos-num">₹{fmt2(pos.avg_price)}</td>
                    <td className="pos-num">₹{fmt2(pos.ltp)}</td>
                    <td className={`pos-num ${pnlClass(pos.pnl)}`}>
                      {pos.pnl >= 0 ? '+' : ''}₹{fmt2(pos.pnl)}
                    </td>
                    <td className={`pos-num ${pnlClass(pos.pnl)}`}>
                      {pos.pnl_pct != null ? `${pos.pnl_pct >= 0 ? '+' : ''}${pos.pnl_pct.toFixed(2)}%` : '--'}
                    </td>
                    <td className="pos-num">{productLabel(pos.product)}</td>
                    <td className="pos-action-col">
                      {isSuccess ? (
                        <span className="pos-exit-ok">Sent ✓</span>
                      ) : (
                        <button
                          className="pos-exit-btn"
                          disabled={isExiting}
                          onClick={() => handleExit(pos)}
                        >
                          {isExiting ? '…' : 'Exit'}
                        </button>
                      )}
                      {err && <div className="pos-exit-err">{err}</div>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {loading && data && <div className="pos-refreshing">Refreshing…</div>}
    </div>
  )
}
