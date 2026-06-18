import { useState, useEffect, useCallback } from 'react'

type Env = 'PROD' | 'UAT'

interface Session {
  access_token: string
  device_id: string
  environment: Env
}

interface OrderItem {
  order_id: number
  ref_id: number
  display_name: string
  order_side: string
  order_status: string
  order_price: number
  order_qty: number
  order_delivery_type: string
  tag: string | null
  order_time: number | null
}

interface OrdersPanelProps {
  session: Session
  executionSession?: Session | null
}

const POLL_MS = 10_000

const STATUS_CLASS: Record<string, string> = {
  ORDER_STATUS_FILLED: 'order-status-filled',
  ORDER_STATUS_PENDING: 'order-status-pending',
  ORDER_STATUS_OPEN: 'order-status-pending',
  ORDER_STATUS_SENT: 'order-status-pending',
  ORDER_STATUS_CANCELLED: 'order-status-cancelled',
  ORDER_STATUS_REJECTED: 'order-status-rejected',
}

function statusLabel(s: string) {
  return s.replace('ORDER_STATUS_', '')
}

function sideLabel(s: string) {
  return s.replace('ORDER_SIDE_', '')
}

function fmtTime(ns: number | null) {
  if (!ns) return '--'
  const ms = Math.floor(ns / 1_000_000)
  if (ms <= 0 || ms > 2e15) return '--'
  return new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function OrdersPanel({ session, executionSession }: OrdersPanelProps) {
  const [orders, setOrders] = useState<OrderItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const activeSession = executionSession ?? session

  const fetchOrders = useCallback((showLoading = false) => {
    if (showLoading) setLoading(true)
    fetch('/api/positioning/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_token: activeSession.access_token,
        device_id: activeSession.device_id,
        environment: activeSession.environment,
      }),
    })
      .then(async (r) => {
        const payload = await r.json() as { orders?: OrderItem[]; detail?: unknown }
        if (!r.ok) {
          const d = payload.detail
          setError(typeof d === 'string' ? d : 'Failed to load orders')
        } else {
          setOrders(payload.orders ?? [])
          setError(null)
        }
      })
      .catch(() => setError('Network error fetching orders'))
      .finally(() => setLoading(false))
  }, [activeSession.access_token, activeSession.device_id, activeSession.environment])

  useEffect(() => {
    fetchOrders(true)
    const id = setInterval(() => fetchOrders(false), POLL_MS)
    return () => clearInterval(id)
  }, [fetchOrders])

  if (loading && !orders.length) {
    return <div className="pos-panel-empty">Loading orders…</div>
  }

  if (error) {
    return <div className="pos-panel-empty neg-text">{error}</div>
  }

  return (
    <div className="pos-panel">
      <div className="pos-panel-header">
        <span className="pos-panel-title">Orders (Today)</span>
        <span className="pos-panel-env">{activeSession.environment}</span>
        <button className="pos-refresh-btn" onClick={() => fetchOrders(false)} title="Refresh">↻</button>
      </div>

      {orders.length === 0 ? (
        <div className="pos-panel-empty">No option orders today</div>
      ) : (
        <div className="pos-table-wrap">
          <table className="pos-table">
            <thead>
              <tr>
                <th>Instrument</th>
                <th>Side</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Status</th>
                <th>Time</th>
                <th>Order ID</th>
              </tr>
            </thead>
            <tbody>
              {[...orders].reverse().map((o) => {
                const side = sideLabel(o.order_side)
                return (
                  <tr key={o.order_id}>
                    <td className="pos-instrument">
                      <span className="pos-name">{o.display_name || `Ref #${o.ref_id}`}</span>
                    </td>
                    <td className={`pos-side ${side === 'BUY' ? 'pos-text' : 'neg-text'}`}>{side}</td>
                    <td className="pos-num">{o.order_qty}</td>
                    <td className="pos-num">
                      {o.order_price > 0
                        ? `₹${o.order_price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : 'MKT'}
                    </td>
                    <td>
                      <span className={`order-status-badge ${STATUS_CLASS[o.order_status] ?? ''}`}>
                        {statusLabel(o.order_status)}
                      </span>
                    </td>
                    <td className="pos-num">{fmtTime(o.order_time)}</td>
                    <td className="pos-num" style={{ opacity: 0.5, fontSize: '11px' }}>#{o.order_id}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
