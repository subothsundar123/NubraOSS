import { useState, useEffect, useRef, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

type Env = 'PROD' | 'UAT'
type Side = 'BUY' | 'SELL'
type Product = 'MIS' | 'CNC' | 'NRML'
type PriceType = 'MARKET' | 'LIMIT'

export interface EquityInstrument {
  mode: 'equity'
  symbol: string
  exchange: 'NSE' | 'BSE'
  displayName: string
}

export interface OptionInstrument {
  mode: 'option'
  underlying: string
  strikePrice: number
  optionType: 'CE' | 'PE'
  expiry: string | null
  ltp: number | null
  ref_id?: number | null
}

export type TradableInstrument = EquityInstrument | OptionInstrument

interface TradePanelProps {
  instrument: TradableInstrument | null
  suggestedPrice: number | null
  session: {
    access_token: string
    device_id: string
    environment: Env
  }
  executionSession?: {
    access_token: string
    device_id: string
    environment: Env
  } | null
  defaultSide?: Side
  onOrderPlaced?: (orderId: number | null, message: string, env: Env) => void
  onRequestEnvAuth?: (env: Env) => void
}

// ── Preview & order result types ──────────────────────────────────────────────

interface EquityPreview {
  kind: 'equity'
  instrument_ref_id: number
  instrument_display_name: string
  symbol: string
  exchange: string
  order_qty: number
  lot_size: number
  tick_size: number
  ltp_price: number
  preview_limit_price: number
  estimated_order_value: number
  order_delivery_type: string
  tag: string
}

interface OptionPreview {
  kind: 'option'
  instrument_ref_id: number
  instrument_display_name: string
  lot_size: number
  tick_size: number
  lots: number
  order_qty: number
  ltp_price: number
  preview_limit_price: number
  estimated_order_value: number
  order_delivery_type: string
  tag: string
}

type Preview = EquityPreview | OptionPreview

interface OrderResult {
  order_id: number | null
  order_status: string | null
  message: string
  side: Side
  env: Env
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractApiError(data: Record<string, unknown>, fallback = 'Request failed'): string {
  const detail = data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    // FastAPI validation error format: [{loc, msg, type}, ...]
    const msgs = detail.map((d: unknown) => {
      if (d && typeof d === 'object') {
        const o = d as Record<string, unknown>
        return typeof o.msg === 'string' ? o.msg : JSON.stringify(o)
      }
      return String(d)
    })
    return msgs.join('; ')
  }
  if (detail && typeof detail === 'object') {
    // Broker error forwarded as an object: { error: "..." } or { message: "..." }
    const o = detail as Record<string, unknown>
    const inner = o.message ?? o.error ?? o.msg
    if (typeof inner === 'string') return inner
    return JSON.stringify(detail)
  }
  // Top-level message/error fields (broker 200 passthrough or custom backend errors)
  const msg = data?.message ?? data?.error
  if (typeof msg === 'string') return msg
  if (msg && typeof msg === 'object') {
    const inner = (msg as Record<string, unknown>).message ?? (msg as Record<string, unknown>).error
    if (typeof inner === 'string') return inner
  }
  return fallback
}

function fmt(v: number | null | undefined, dec = 2): string {
  if (v == null || Number.isNaN(v)) return '--'
  return v.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function fmtVal(v: number | null | undefined): string {
  if (v == null) return '--'
  if (v >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(2)}Cr`
  if (v >= 1_00_000) return `₹${(v / 1_00_000).toFixed(1)}L`
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TradePanel({
  instrument,
  suggestedPrice,
  session,
  executionSession,
  defaultSide = 'BUY',
  onOrderPlaced,
  onRequestEnvAuth,
}: TradePanelProps) {
  const [tradeEnv, setTradeEnv] = useState<Env>(session.environment)
  const [side, setSide] = useState<Side>(defaultSide)
  const [product, setProduct] = useState<Product>(
    instrument?.mode === 'option' ? 'NRML' : 'MIS',
  )
  const [quantity, setQuantity] = useState(1)
  const [priceType, setPriceType] = useState<PriceType>('MARKET')
  const [limitPrice, setLimitPrice] = useState<string>('')

  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')

  const [orderResult, setOrderResult] = useState<OrderResult | null>(null)
  const [placing, setPlacing] = useState(false)
  const [placeError, setPlaceError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset when instrument changes
  useEffect(() => {
    setPreview(null)
    setPreviewError('')
    setOrderResult(null)
    setPlaceError('')
    setConfirmOpen(false)
    setQuantity(1)
    setLimitPrice('')
    setSide(defaultSide)
    setProduct(instrument?.mode === 'option' ? 'NRML' : 'MIS')
  }, [instrument?.mode === 'option'
    ? `${(instrument as OptionInstrument).strikePrice}-${(instrument as OptionInstrument).optionType}`
    : (instrument as EquityInstrument | null)?.symbol ?? ''])

  // ── Preview call ─────────────────────────────────────────────────────────

  const ltp = instrument?.mode === 'option'
    ? ((instrument as OptionInstrument).ltp ?? suggestedPrice ?? 0)
    : (suggestedPrice ?? 0)

  const doPreview = useCallback(async (qty: number) => {
    if (!instrument || qty < 1 || ltp <= 0) {
      setPreview(null)
      return
    }
    setPreviewLoading(true)
    setPreviewError('')
    const activeSession = (tradeEnv !== session.environment && executionSession?.environment === tradeEnv)
      ? executionSession
      : session
    try {
      if (instrument.mode === 'equity') {
        const res = await fetch('/api/scanner/order-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_token: activeSession.access_token,
            device_id: activeSession.device_id,
            environment: tradeEnv,
            symbol: instrument.symbol,
            instrument_display_name: instrument.displayName,
            exchange: instrument.exchange,
            order_side: side === 'BUY' ? 'ORDER_SIDE_BUY' : 'ORDER_SIDE_SELL',
            quantity: qty,
            ltp_price: ltp,
            order_delivery_type: product === 'CNC' ? 'ORDER_DELIVERY_TYPE_CNC' : 'ORDER_DELIVERY_TYPE_IDAY',
          }),
        })
        const data = await res.json() as Record<string, unknown>
        if (!res.ok) throw new Error(extractApiError(data, 'Preview failed'))
        setPreview({ kind: 'equity', ...(data as Omit<EquityPreview, 'kind'>) })
      } else {
        const opt = instrument as OptionInstrument
        const deliveryType = product === 'MIS' ? 'ORDER_DELIVERY_TYPE_IDAY' : 'ORDER_DELIVERY_TYPE_NRML'
        const res = await fetch('/api/positioning/option-order-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_token: activeSession.access_token,
            device_id: activeSession.device_id,
            environment: tradeEnv,
            underlying: opt.underlying,
            strike_price: opt.strikePrice,
            option_type: opt.optionType,
            expiry: opt.expiry,
            ref_id: opt.ref_id ?? null,
            order_side: side === 'BUY' ? 'ORDER_SIDE_BUY' : 'ORDER_SIDE_SELL',
            lots: qty,
            ltp_price: ltp,
            exchange: 'NSE',
            order_delivery_type: deliveryType,
          }),
        })
        const data = await res.json() as Record<string, unknown>
        if (!res.ok) throw new Error(extractApiError(data, 'Preview failed'))
        setPreview({ kind: 'option', ...(data as Omit<OptionPreview, 'kind'>) })
      }
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Preview failed')
      setPreview(null)
    } finally {
      setPreviewLoading(false)
    }
  }, [instrument, ltp, tradeEnv, side, product, session, executionSession])

  // Debounce preview on quantity / side / product / env change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doPreview(quantity), 600)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [quantity, side, product, tradeEnv, doPreview])

  // ── Order placement ───────────────────────────────────────────────────────

  const placeOrder = useCallback(async () => {
    if (!preview || !instrument) return
    setPlacing(true)
    setPlaceError('')
    const activeSession = (tradeEnv !== session.environment && executionSession?.environment === tradeEnv)
      ? executionSession
      : session
    try {
      let data: Record<string, unknown>
      if (preview.kind === 'equity') {
        const p = preview as EquityPreview
        const res = await fetch('/api/scanner/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_token: activeSession.access_token,
            device_id: activeSession.device_id,
            environment: tradeEnv,
            symbol: p.symbol,
            instrument_display_name: p.instrument_display_name,
            exchange: p.exchange,
            instrument_ref_id: p.instrument_ref_id,
            order_side: side === 'BUY' ? 'ORDER_SIDE_BUY' : 'ORDER_SIDE_SELL',
            quantity: p.order_qty,
            lot_size: p.lot_size,
            tick_size: p.tick_size,
            ltp_price: priceType === 'LIMIT' && limitPrice ? parseFloat(limitPrice) : p.ltp_price,
            order_delivery_type: p.order_delivery_type,
            tag: p.tag,
          }),
        })
        data = await res.json() as Record<string, unknown>
        if (!res.ok) throw new Error(extractApiError(data, 'Order failed'))
      } else {
        const p = preview as OptionPreview
        const res = await fetch('/api/scalper/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_token: activeSession.access_token,
            device_id: activeSession.device_id,
            environment: tradeEnv,
            instrument_ref_id: p.instrument_ref_id,
            instrument_display_name: p.instrument_display_name,
            option_leg: (instrument as OptionInstrument).optionType,
            order_side: side === 'BUY' ? 'ORDER_SIDE_BUY' : 'ORDER_SIDE_SELL',
            lots: p.lots,
            lot_size: p.lot_size,
            tick_size: p.tick_size,
            ltp_price: priceType === 'LIMIT' && limitPrice ? parseFloat(limitPrice) : p.ltp_price,
            order_delivery_type: p.order_delivery_type,
            exchange: 'NSE',
            tag: p.tag,
          }),
        })
        data = await res.json() as Record<string, unknown>
        if (!res.ok) throw new Error(extractApiError(data, 'Order failed'))
      }
      const result: OrderResult = {
        order_id: typeof data.order_id === 'number' ? data.order_id : null,
        order_status: typeof data.order_status === 'string' ? data.order_status : null,
        message: typeof data.message === 'string' ? data.message : 'Order sent.',
        side,
        env: tradeEnv,
      }
      setOrderResult(result)
      onOrderPlaced?.(result.order_id, result.message, tradeEnv)
    } catch (err) {
      setPlaceError(err instanceof Error ? err.message : 'Order failed')
    } finally {
      setPlacing(false)
      setConfirmOpen(false)
    }
  }, [preview, instrument, session, executionSession, tradeEnv, side, priceType, limitPrice, onOrderPlaced])

  const handleCTA = () => {
    if (!preview) return
    if (tradeEnv === 'PROD') {
      setConfirmOpen(true)
    } else {
      void placeOrder()
    }
  }

  // ── Derived display ───────────────────────────────────────────────────────

  const effectiveSession = (tradeEnv !== session.environment && executionSession?.environment === tradeEnv)
    ? executionSession
    : session
  const envMismatch = tradeEnv !== session.environment && effectiveSession === session
  const canPlace = Boolean(preview && !previewLoading && !placing && !envMismatch)

  const instrumentLabel = instrument == null
    ? 'Select an instrument'
    : instrument.mode === 'equity'
      ? instrument.displayName
      : `${(instrument as OptionInstrument).underlying} ${(instrument as OptionInstrument).strikePrice} ${(instrument as OptionInstrument).optionType}`

  const qtyLabel = instrument?.mode === 'option'
    ? (preview ? `${quantity} lot${quantity !== 1 ? 's' : ''} = ${(preview as OptionPreview).order_qty} qty` : `${quantity} lot${quantity !== 1 ? 's' : ''}`)
    : `${quantity} share${quantity !== 1 ? 's' : ''}`

  // ── Render ────────────────────────────────────────────────────────────────

  if (!instrument) {
    return (
      <div className="trade-panel trade-panel-empty">
        <span>Select an instrument to trade</span>
      </div>
    )
  }

  if (orderResult) {
    const isSuccess = !placeError
    return (
      <div className="trade-panel">
        <div className={`trade-result ${isSuccess ? 'trade-result-ok' : 'trade-result-err'}`}>
          <span className="trade-result-icon">{isSuccess ? '✓' : '✕'}</span>
          <div>
            <strong>{isSuccess ? `${orderResult.side} order sent` : 'Order failed'}</strong>
            <p>{isSuccess ? orderResult.message : placeError}</p>
            {orderResult.order_id && <small>Order #{orderResult.order_id} · {orderResult.order_status ?? 'Processing'}</small>}
            <small className="trade-result-env">{orderResult.env}</small>
          </div>
        </div>
        <button className="trade-again-btn" onClick={() => { setOrderResult(null); setPlaceError('') }}>
          Trade again
        </button>
      </div>
    )
  }

  return (
    <div className="trade-panel">

      {/* ── Environment bar ── */}
      <div className="trade-env-bar">
        <span className="trade-env-label">Environment</span>
        <div className="trade-env-toggle" role="group">
          {(['UAT', 'PROD'] as Env[]).map(env => (
            <button
              key={env}
              className={`trade-env-btn${tradeEnv === env ? ' active' : ''}${env === 'PROD' ? ' prod' : ''}`}
              onClick={() => setTradeEnv(env)}
            >
              <span className={`trade-env-dot ${env === session.environment ? 'connected' : 'disconnected'}`} />
              {env}
            </button>
          ))}
        </div>
        {envMismatch && (
          <span className="trade-env-warn">
            Not connected to {tradeEnv}
            {onRequestEnvAuth && (
              <button
                className="trade-env-auth-btn"
                onClick={() => onRequestEnvAuth(tradeEnv)}
              >
                Login →
              </button>
            )}
          </span>
        )}
      </div>

      {/* ── Instrument header ── */}
      <div className="trade-instrument-row">
        <span className="trade-instrument-name">{instrumentLabel}</span>
        {ltp > 0 && <span className="trade-instrument-ltp">₹{fmt(ltp)}</span>}
        {instrument.mode === 'equity' && (
          <span className="trade-instrument-meta">{(instrument as EquityInstrument).exchange}</span>
        )}
        {instrument.mode === 'option' && (instrument as OptionInstrument).expiry && (
          <span className="trade-instrument-meta">{(instrument as OptionInstrument).expiry}</span>
        )}
      </div>

      {/* ── Side + Product ── */}
      <div className="trade-action-row">
        <div className="trade-side-group" role="group">
          <button
            className={`trade-side-btn buy${side === 'BUY' ? ' active' : ''}`}
            onClick={() => setSide('BUY')}
          >BUY</button>
          <button
            className={`trade-side-btn sell${side === 'SELL' ? ' active' : ''}`}
            onClick={() => setSide('SELL')}
          >SELL</button>
        </div>
        <div className="trade-product-group" role="group">
          {(instrument.mode === 'option' ? ['NRML', 'MIS'] : ['MIS', 'CNC']).map(p => (
            <button
              key={p}
              className={`trade-product-btn${product === p ? ' active' : ''}`}
              onClick={() => setProduct(p as Product)}
            >{p}</button>
          ))}
        </div>
      </div>

      {/* ── Quantity + Price type ── */}
      <div className="trade-inputs-row">
        <div className="trade-input-group">
          <label className="trade-input-label">
            {instrument.mode === 'option' ? 'Lots' : 'Qty'}
          </label>
          <div className="trade-qty-control">
            <button className="trade-qty-step" onClick={() => setQuantity(q => Math.max(1, q - 1))}>−</button>
            <input
              type="number"
              className="trade-qty-input"
              min={1}
              max={instrument.mode === 'option' ? 500 : 100000}
              value={quantity}
              onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
            />
            <button className="trade-qty-step" onClick={() => setQuantity(q => q + 1)}>+</button>
          </div>
          <span className="trade-qty-label">{qtyLabel}</span>
        </div>

        <div className="trade-input-group">
          <label className="trade-input-label">Price</label>
          <div className="trade-price-toggle" role="group">
            {(['MARKET', 'LIMIT'] as PriceType[]).map(pt => (
              <button
                key={pt}
                className={`trade-price-btn${priceType === pt ? ' active' : ''}`}
                onClick={() => setPriceType(pt)}
              >{pt}</button>
            ))}
          </div>
          {priceType === 'LIMIT' && (
            <input
              type="number"
              className="trade-limit-input"
              placeholder={preview ? String(preview.preview_limit_price) : 'Enter price'}
              value={limitPrice}
              onChange={e => setLimitPrice(e.target.value)}
              step={0.05}
              min={0.05}
            />
          )}
        </div>
      </div>

      {/* ── Preview strip ── */}
      <div className="trade-preview-strip">
        {previewLoading && <span className="trade-preview-loading">Calculating…</span>}
        {previewError && !previewLoading && (
          <span className="trade-preview-error">{previewError}</span>
        )}
        {preview && !previewLoading && (
          <>
            <div className="trade-preview-item">
              <span>Est. value</span>
              <strong>{fmtVal(preview.estimated_order_value)}</strong>
            </div>
            <div className="trade-preview-item">
              <span>Limit price</span>
              <strong>₹{fmt(preview.preview_limit_price)}</strong>
            </div>
            {preview.kind === 'equity' && (
              <div className="trade-preview-item">
                <span>Qty</span>
                <strong>{(preview as EquityPreview).order_qty}</strong>
              </div>
            )}
            {preview.kind === 'option' && (
              <div className="trade-preview-item">
                <span>Lot size</span>
                <strong>{(preview as OptionPreview).lot_size}</strong>
              </div>
            )}
            <div className="trade-preview-item">
              <span>Product</span>
              <strong>{product}</strong>
            </div>
          </>
        )}
      </div>

      {/* ── CTA ── */}
      <button
        className={`trade-cta-btn${side === 'BUY' ? ' buy' : ' sell'}${tradeEnv === 'PROD' ? ' prod' : ''}`}
        onClick={handleCTA}
        disabled={!canPlace || placing}
      >
        {placing
          ? 'Placing…'
          : !preview && !previewLoading
            ? 'Enter quantity to preview'
            : envMismatch
              ? `Connect ${tradeEnv} first`
              : tradeEnv === 'PROD'
                ? `⚠ Place ${side} — LIVE`
                : `Place ${side} on UAT`}
      </button>

      {placeError && <p className="trade-place-error">{placeError}</p>}

      {/* ── PROD confirmation modal ── */}
      {confirmOpen && preview && (
        <div className="trade-confirm-overlay" onClick={() => setConfirmOpen(false)}>
          <div className="trade-confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="trade-confirm-header">
              <span className="trade-confirm-warn-icon">⚠</span>
              <strong>Live Order Confirmation</strong>
            </div>
            <p className="trade-confirm-desc">
              You are placing a <strong>LIVE order on PRODUCTION</strong>. This will execute immediately at the exchange.
            </p>
            <div className="trade-confirm-summary">
              <div><span>Instrument</span><strong>{instrumentLabel}</strong></div>
              <div><span>Action</span><strong className={side === 'BUY' ? 'pos-text' : 'neg-text'}>{side}</strong></div>
              <div>
                <span>Quantity</span>
                <strong>
                  {preview.kind === 'option'
                    ? `${(preview as OptionPreview).lots} lots (${(preview as OptionPreview).order_qty} qty)`
                    : `${(preview as EquityPreview).order_qty} shares`}
                </strong>
              </div>
              <div>
                <span>Price</span>
                <strong>{priceType === 'LIMIT' && limitPrice ? `₹${limitPrice}` : `₹${fmt(preview.preview_limit_price)} (limit)`}</strong>
              </div>
              <div><span>Product</span><strong>{product}</strong></div>
              <div><span>Est. value</span><strong>{fmtVal(preview.estimated_order_value)}</strong></div>
            </div>
            <div className="trade-confirm-actions">
              <button className="trade-confirm-cancel" onClick={() => setConfirmOpen(false)}>Cancel</button>
              <button
                className="trade-confirm-ok"
                onClick={() => void placeOrder()}
                disabled={placing}
              >
                {placing ? 'Placing…' : `Confirm ${side} →`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
