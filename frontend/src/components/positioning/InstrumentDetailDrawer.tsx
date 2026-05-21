import { useEffect, useRef, useState } from 'react'
import ScalperLiveChart from '../ScalperLiveChart'
import { ConfidenceBar, DirectionBadge, ScorePill, SignalChip } from '../dashboard/MetricTile'
import InfoTip from '../InfoTip'
import type { PositioningSnapshot } from '../../positioning/types'
import { useInstrumentContext } from '../../positioning/useInstrumentContext'

interface InstrumentDetailDrawerProps {
  symbol: string | null
  leaderSymbol?: string | null
  snapshot: PositioningSnapshot | null
  session: {
    access_token: string
    device_id: string
    environment: 'PROD' | 'UAT'
  }
  onClose: () => void
  onOpenScalper?: (symbol: string) => void
  onCreateAlert?: (symbol: string) => void
}

const DRAWER_WIDTH_KEY = 'positioning-drawer-width'
const MIN_WIDTH = 300
const MAX_WIDTH = 860

function clampWidth(w: number): number {
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w))
}

function readStoredWidth(): number {
  try {
    const raw = localStorage.getItem(DRAWER_WIDTH_KEY)
    if (raw) return clampWidth(parseInt(raw, 10))
  } catch {}
  return 520
}

function fmtPrice(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '--'
  return value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtPct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '--'
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

function relation(price: number | null, level: number | null, above: string, below: string): string {
  if (price == null || level == null) return 'Awaiting level'
  return price >= level ? above : below
}

export default function InstrumentDetailDrawer({
  symbol,
  leaderSymbol,
  snapshot,
  session,
  onClose,
  onOpenScalper,
  onCreateAlert,
}: InstrumentDetailDrawerProps) {
  // ── Panel visibility state — independent of symbol selection ──────────────
  const [panelOpen, setPanelOpen] = useState(false)

  // Auto-open only when user explicitly selects a symbol (symbol transitions null→value)
  const prevSymbol = useRef<string | null>(null)
  useEffect(() => {
    if (symbol && prevSymbol.current === null) setPanelOpen(true)
    prevSymbol.current = symbol
  }, [symbol])

  // ── New leader glow — pulse toggle tab when leaderSymbol changes ──────────
  const [leaderNew, setLeaderNew] = useState(false)
  const prevLeader = useRef<string | null | undefined>(leaderSymbol)
  useEffect(() => {
    if (leaderSymbol && leaderSymbol !== prevLeader.current) {
      setLeaderNew(true)
      const t = setTimeout(() => setLeaderNew(false), 2200)
      prevLeader.current = leaderSymbol
      return () => clearTimeout(t)
    }
    prevLeader.current = leaderSymbol
  }, [leaderSymbol])

  // ── Resizable width ────────────────────────────────────────────────────────
  const [width, setWidth] = useState(readStoredWidth)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(width)

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    dragStartX.current = e.clientX
    dragStartWidth.current = width
    setIsDragging(true)
  }

  useEffect(() => {
    if (!isDragging) return
    const onMove = (e: MouseEvent) => {
      // Dragging left → increase width; dragging right → decrease width
      const delta = dragStartX.current - e.clientX
      setWidth(clampWidth(dragStartWidth.current + delta))
    }
    const onUp = (e: MouseEvent) => {
      const delta = dragStartX.current - e.clientX
      const final = clampWidth(dragStartWidth.current + delta)
      setWidth(final)
      setIsDragging(false)
      try { localStorage.setItem(DRAWER_WIDTH_KEY, String(final)) } catch {}
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isDragging])

  // Suppress text selection cursor during drag
  useEffect(() => {
    if (isDragging) {
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'col-resize'
    } else {
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [isDragging])

  // ── Content derivation ────────────────────────────────────────────────────
  const opportunity = snapshot?.opportunities?.rows?.find((row) => row.symbol === symbol) ?? null
  const smartMoney = snapshot?.smart_money?.candidates?.find((row) => row.symbol === symbol) ?? null
  const sector = snapshot?.sector_rotation?.sectors?.find((item) => item.sector === opportunity?.sector) ?? null
  const contextualAlerts = (snapshot?.alerts ?? []).filter((alert) => {
    const text = `${alert.title} ${alert.message} ${JSON.stringify(alert.payload)}`.toUpperCase()
    return symbol ? text.includes(symbol.toUpperCase()) || text.includes(String(opportunity?.sector ?? '').toUpperCase()) : false
  })
  const contextualCommentary = (snapshot?.commentary ?? []).filter((item) => {
    const text = `${item.title} ${item.message}`.toUpperCase()
    return symbol ? text.includes(symbol.toUpperCase()) || text.includes(String(opportunity?.sector ?? '').toUpperCase()) || (item.tags ?? []).includes('regime') : false
  })

  const instrument = useInstrumentContext({
    enabled: panelOpen,
    symbol,
    sessionToken: session.access_token,
    deviceId: session.device_id,
    environment: session.environment,
    opportunity,
  })
  const latestPrice = instrument.latestPrice
  const dayMove = instrument.quote?.day_change_pct ?? opportunity?.change_pct ?? null
  const volumeRatio = opportunity?.volume_ratio ?? 0
  const vwapState = instrument.vwap?.relation ? instrument.vwap.relation.replace(/_/g, ' ') : relation(latestPrice, instrument.latestVwap, 'Above VWAP', 'Below VWAP')
  const openingRangeState =
    instrument.openingRange?.state?.replace(/_/g, ' ') ??
    (latestPrice != null && instrument.openingRangeHigh != null && latestPrice > instrument.openingRangeHigh
      ? 'Above opening range'
      : latestPrice != null && instrument.openingRangeLow != null && latestPrice < instrument.openingRangeLow
        ? 'Below opening range'
        : 'Inside opening range')
  const momentumState = (opportunity?.change_pct ?? 0) > 1 && volumeRatio >= 1.5 ? 'Momentum confirmed' : (opportunity?.change_pct ?? 0) < -1 && volumeRatio >= 1.5 ? 'Downside pressure' : 'Developing'
  const structureState = instrument.structure?.phase?.replace(/_/g, ' ') ?? instrument.signals[0]?.signals[0]?.label ?? 'No structure break'
  const optionsDirection = snapshot?.options_pressure?.score?.direction ?? 'neutral'
  const optionsAligned = optionsDirection === 'neutral' || optionsDirection === snapshot?.sentiment?.score?.direction
  const riskFlags = [
    snapshot?.regime?.regime === 'volatile_chop' ? 'Chop risk elevated' : null,
    volumeRatio < 1.2 ? 'Weak volume confirmation' : null,
    snapshot?.breadth?.score?.direction === 'bearish' && (opportunity?.change_pct ?? 0) > 0 ? 'Breadth divergence' : null,
    !optionsAligned ? 'Options pressure not aligned' : null,
  ].filter((item): item is string => Boolean(item))

  // Escape key — collapse panel (preserves symbol in parent)
  useEffect(() => {
    if (!panelOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanelOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [panelOpen])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <aside
      className={`positioning-detail-drawer${panelOpen ? ' is-open' : ''}${isDragging ? ' is-resizing' : ''}`}
      style={{ width }}
      aria-hidden={!panelOpen}
    >
      {/* Resize handle — drag left edge to change width */}
      <div className="drawer-resize-handle" onMouseDown={handleResizeStart} />

      {/* Toggle tab — always visible, slides drawer in/out */}
      <button
        className={`drawer-toggle-tab${leaderNew ? ' is-leader-new' : ''}`}
        onClick={() => setPanelOpen((prev) => !prev)}
        title={panelOpen ? 'Collapse panel' : 'Expand panel'}
        aria-label={panelOpen ? 'Collapse execution context' : 'Expand execution context'}
      >
        <span className="drawer-toggle-chevron">{panelOpen ? '›' : '‹'}</span>
      </button>

      {/* ── Main content ── */}
      <div className="drawer-content">
        <div className="positioning-detail-head">
          <div>
            <span>Execution context</span>
            <h2>{symbol ?? 'Select symbol'}</h2>
            <p>{opportunity?.sector ?? 'Opportunity radar drilldown'} / {snapshot?.regime?.label ?? 'Neutral tape'}</p>
          </div>
          <div className="positioning-detail-actions">
            <button className="ghost-inline" onClick={() => symbol && onOpenScalper?.(symbol)} disabled={!symbol}>Scalper</button>
            <button className="ghost-inline" onClick={() => symbol && onCreateAlert?.(symbol)} disabled={!symbol}>Alert</button>
            <button className="ghost-inline" onClick={() => { setPanelOpen(false); onClose() }}>Close</button>
          </div>
        </div>

        <div className="positioning-detail-band">
          <div><span>Live Price</span><strong>{fmtPrice(latestPrice)}</strong><small>{instrument.quoteState}</small></div>
          <div><span>Move <InfoTip term="momentum" /></span><strong className={(dayMove ?? 0) >= 0 ? 'pos-text' : 'neg-text'}>{fmtPct(dayMove)}</strong><small>{momentumState}</small></div>
          <div><span>Quality <InfoTip term="quality_score" /></span><ScorePill value={opportunity?.quality_score} /><small>Radar score</small></div>
          <div><span>Volume <InfoTip term="volume_ratio" /></span><strong>{volumeRatio.toFixed(2)}x</strong><small>{volumeRatio >= 2 ? 'abnormal' : 'normal'}</small></div>
        </div>

        <div className="positioning-detail-chart">
          <ScalperLiveChart
            panel="underlying"
            accent="blue"
            title={symbol ?? 'Instrument'}
            displayName={opportunity?.display_name ?? symbol}
            lastPrice={latestPrice}
            interval="1m"
            exchange={opportunity?.exchange ?? 'NSE'}
            fallbackCandles={instrument.candles}
            overlays={instrument.overlays}
            signals={instrument.signals}
            height={260}
            hasData={instrument.candles.length > 0}
            emptyLabel={instrument.loading ? 'Loading candles...' : 'No chart data yet'}
            onSeriesReady={() => undefined}
          />
        </div>

        <section className="positioning-detail-section">
          <div className="positioning-detail-section-head">
            <h3>Live Structure <InfoTip term="live_structure" /></h3>
            <SignalChip tone={instrument.quoteState === 'connected' ? 'positive' : 'neutral'}>{instrument.quoteState}</SignalChip>
          </div>
          <div className="positioning-context-list">
            <div><span>VWAP <InfoTip term="vwap" /></span><strong>{vwapState}</strong><small>{instrument.latestVwap ? fmtPrice(instrument.latestVwap) : '--'}</small></div>
            <div><span>Opening Range <InfoTip term="opening_range" /></span><strong>{openingRangeState}</strong><small>{instrument.openingRangeHigh ? `${fmtPrice(instrument.openingRangeLow)} - ${fmtPrice(instrument.openingRangeHigh)}` : '--'}</small></div>
            <div><span>Momentum <InfoTip term="momentum" /></span><strong>{momentumState}</strong><small>{structureState}</small></div>
          </div>
        </section>

        <div className="positioning-detail-grid">
          <div>
            <span>Quality <InfoTip term="quality_score" /></span>
            <ScorePill value={opportunity?.quality_score} />
            <ConfidenceBar value={snapshot?.opportunities?.score?.confidence ?? 0} />
          </div>
          <div>
            <span>Momentum <InfoTip term="momentum" /></span>
            <strong className={(opportunity?.change_pct ?? 0) >= 0 ? 'pos-text' : 'neg-text'}>
              {(opportunity?.change_pct ?? 0) >= 0 ? '+' : ''}{(opportunity?.change_pct ?? 0).toFixed(2)}%
            </strong>
          </div>
          <div>
            <span>Volume <InfoTip term="volume_ratio" /></span>
            <strong>{(opportunity?.volume_ratio ?? 0).toFixed(2)}x</strong>
            <SignalChip tone={(opportunity?.volume_ratio ?? 0) >= 2 ? 'positive' : 'neutral'}>
              {(opportunity?.volume_ratio ?? 0) >= 2 ? 'Abnormal' : 'Normal'}
            </SignalChip>
          </div>
          <div>
            <span>Sector <InfoTip term="sector_rotation" /></span>
            <strong>{typeof sector?.strength === 'number' ? sector.strength.toFixed(1) : '--'}</strong>
            <small>{opportunity?.sector ?? 'No sector'}</small>
          </div>
          <div>
            <span>Smart Money <InfoTip term="smart_money" /></span>
            <strong>{typeof smartMoney?.score === 'number' ? smartMoney.score.toFixed(1) : '--'}</strong>
            <small>{String(smartMoney?.bias ?? 'pending')}</small>
          </div>
          <div>
            <span>Market Alignment <InfoTip term="market_alignment" /></span>
            <DirectionBadge direction={snapshot?.sentiment?.score?.direction} />
            <small>{snapshot?.regime?.label ?? 'Neutral'}</small>
          </div>
          <div>
            <span>Options Context <InfoTip term="options_pressure" /></span>
            <strong>{optionsAligned ? 'Aligned' : 'Divergent'}</strong>
            <small>Call {typeof snapshot?.options_pressure?.call_pressure === 'number' ? snapshot.options_pressure.call_pressure.toFixed(1) : '--'} / Put {typeof snapshot?.options_pressure?.put_pressure === 'number' ? snapshot.options_pressure.put_pressure.toFixed(1) : '--'}</small>
          </div>
          <div>
            <span>Breadth Confirmation <InfoTip term="breadth_confirmation" /></span>
            <DirectionBadge direction={snapshot?.breadth?.score?.direction} />
            <small>{snapshot?.breadth?.advances ?? 0} adv / {snapshot?.breadth?.declines ?? 0} dec</small>
          </div>
        </div>

        <section className="positioning-detail-section">
          <div className="positioning-detail-section-head"><h3>Risk Context <InfoTip term="risk_context" /></h3><SignalChip tone={riskFlags.length ? 'negative' : 'positive'}>{riskFlags.length ? `${riskFlags.length} flags` : 'Clean'}</SignalChip></div>
          {(riskFlags.length ? riskFlags : ['No major Phase 1 risk flags from regime, volume, breadth or options alignment.']).map((flag) => (
            <p key={flag}>{flag}</p>
          ))}
        </section>

        <section className="positioning-detail-section">
          <div className="positioning-detail-section-head"><h3>Why it matters</h3><SignalChip>Context</SignalChip></div>
          {(opportunity?.reason ?? ['Select an active opportunity to inspect alignment, risk and commentary.']).map((reason) => (
            <p key={reason}>{reason}</p>
          ))}
          {contextualCommentary.slice(0, 2).map((item) => (
            <p key={item.id}><strong>{item.title}:</strong> {item.message}</p>
          ))}
        </section>

        <section className="positioning-detail-section">
          <div className="positioning-detail-section-head"><h3>Recent Alerts</h3><SignalChip>{contextualAlerts.length || 'None'}</SignalChip></div>
          {(contextualAlerts.length ? contextualAlerts.slice(0, 4) : []).map((alert) => (
            <p key={alert.id}><strong>{alert.title}:</strong> {alert.message}</p>
          ))}
          {contextualAlerts.length === 0 ? <p>No symbol-specific alerts. Watch for sector rotation, regime changes and abnormal volume expansion.</p> : null}
        </section>
      </div>
    </aside>
  )
}
