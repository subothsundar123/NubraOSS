import { FormEvent, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import {
  createChart,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type Logical,
  type UTCTimestamp,
} from 'lightweight-charts'
import { useOptionChain } from '../positioning/useOptionChain'
import OptionChainTable, { type SelectedOption } from './positioning/OptionChainTable'
import './range-trader.css'

type Environment = 'PROD' | 'UAT'
type RangeStatus = 'draft' | 'armed' | 'paused' | 'stopped' | 'risk_locked'
type LineRole = 'entry' | 'exit' | 'target' | 'stop_loss' | 'alert'
type LineShape = 'level' | 'trend'
type Trigger = 'touch' | 'cross' | 'close_above' | 'close_below'
type RepeatPolicy = 'once' | 'every_touch' | 'after_reset_distance' | 'after_exit'
type Timeframe = '1m' | '3m' | '5m' | '15m'
type PositionStatus = 'idle' | 'entry_pending' | 'in_position' | 'exit_pending' | 'closed'

interface Session {
  access_token: string
  device_id: string
  account_id: string
  user_name: string
  environment: Environment
  is_demo?: boolean
}

interface Instrument {
  symbol: string
  display_name: string
  exchange: 'NSE' | 'BSE' | 'NFO'
  instrument_type: string
  derivative_type: string | null
  option_type: string | null
  expiry: string | null
  strike_price: number | null
  chart_symbol?: string | null
  ltp_hint?: number | null
  ref_id: number
  tick_size: number
  lot_size: number
}

interface Candle {
  epoch_ms: number
  open: number
  high: number
  low: number
  close: number
  volume: number | null
}

interface RangePoint {
  time: number
  price: number
  logical?: number
  last_time?: number
  offset_from_last?: number
  bar_offset_from_last?: number
}

interface RangeLine {
  id: string
  role: LineRole
  shape?: LineShape
  label: string
  trigger: Trigger
  repeat_policy: RepeatPolicy
  reset_distance: number | null
  close_buffer: number | null
  armed: boolean
  points: RangePoint[]
}

interface LineDrag {
  lineId: string
  mode: 'body' | 'endpoint'
  pointIndex: 0 | 1
  startPoint: RangePoint
  originalPoints: RangePoint[]
}

interface RangePartialExit {
  exit_line_id?: string
  exit_price?: number
  exit_epoch_s?: number
  exit_order_id?: number | null
  exit_order_status?: string | null
  exit_filled_qty?: number
  pnl?: number
}

interface RangeEntry {
  id: string
  line_id: string
  side: 'BUY' | 'SELL'
  quantity: number
  requested_qty?: number
  filled_qty?: number
  entry_price: number
  trigger_price?: number
  line_price: number
  entry_epoch_s: number
  order_id: number | null
  order_status: string | null
  order_price?: number | null
  reject_reason?: string | null
  status: 'pending' | 'open' | 'closed' | 'rejected' | 'cancelled'
  exit_line_id?: string
  exit_price?: number
  exit_epoch_s?: number
  exit_order_id?: number | null
  exit_order_status?: string | null
  exit_filled_qty?: number
  partial_exits?: RangePartialExit[]
  pnl?: number
}

interface PnlSummary {
  realized: number
  unrealized: number
  total: number
  openEntries: number
  closedEntries: number
  pendingEntries: number
  rejectedEntries: number
  totalEntries: number
  openQty: number
  filledQty: number
  closedQty: number
  avgEntryPrice: number | null
  lastPrice: number | null
}

interface RangeSetup {
  id: string
  account_id: string
  environment: Environment
  title: string
  symbol: string
  display_name: string
  exchange: 'NSE' | 'BSE' | 'NFO'
  instrument_type: string
  derivative_type: string | null
  option_type: string | null
  expiry: string | null
  strike_price: number | null
  ltp_hint?: number | null
  ref_id: number
  tick_size: number
  lot_size: number
  timeframe: Timeframe
  side: 'BUY' | 'SELL'
  quantity: number
  order_type: 'AGGRESSIVE_LIMIT' | 'MARKET' | 'LIMIT'
  tolerance_value: number
  tolerance_mode: 'percent' | 'ticks' | 'points'
  max_loss: number | null
  exit_on_max_loss: boolean
  status: RangeStatus
  created_at: string
  updated_at: string
	  payload: {
	    lines: RangeLine[]
	    entries: RangeEntry[]
	    line_states?: Record<string, Record<string, unknown>>
	    position_status?: PositionStatus
	    open_quantity?: number
	    entry_order_id?: number | null
	    exit_order_id?: number | null
	    entry_price?: number | null
	    exit_price?: number | null
	    limit_price?: number | null
	    notes?: string | null
	  }
	}

interface RangeEvent {
  id: string
  created_at: string
  level: 'info' | 'success' | 'warn' | 'error'
  event_type: string
  message: string
  payload?: Record<string, unknown>
}

interface LineRuntimeStatus {
  id: string
  label: string
  role: LineRole
  trigger: Trigger
  repeat_policy: RepeatPolicy
  armed: boolean
  fired: boolean
  waiting_for_reset: boolean
  line_price: number
  ltp: number
  distance: number
  tolerance: number
  relation: number
  decision: string
  trigger_hit: boolean
  can_fire: boolean
}

interface Props {
  session: Session
  executionEnvironment: Environment
  onExecutionEnvironmentChange: (env: Environment) => void
  onAuthRequired: (env: Environment, message: string) => void
  renderNav: (activeTab: string) => ReactNode
  onBack: () => void
}

const timeframes: Timeframe[] = ['1m', '3m', '5m', '15m']
const roleLabels: Record<LineRole, string> = {
  entry: 'Entry',
  exit: 'Exit',
  target: 'Target',
  stop_loss: 'Stop Loss',
  alert: 'Alert',
}
const roleColors: Record<LineRole, string> = {
  entry: '#00e5ff',
  exit: '#ffb000',
  target: '#00ff85',
  stop_loss: '#ff2d55',
  alert: '#c084fc',
}
const IST_OFFSET_SECONDS = 5.5 * 60 * 60

function chartTimeFromEpoch(epochS: number): UTCTimestamp {
  return Math.floor(epochS + IST_OFFSET_SECONDS) as UTCTimestamp
}

function epochFromChartTime(chartTime: number): number {
  return Math.floor(chartTime - IST_OFFSET_SECONDS)
}

function fmt(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '--'
  return value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function qtyValue(value: number | null | undefined): number {
  const next = Number(value || 0)
  return Number.isFinite(next) ? next : 0
}

function entryUnrealizedPnl(entry: RangeEntry, price: number | null): number {
  if (entry.status !== 'open' || price == null) return 0
  const qty = qtyValue(entry.quantity)
  const entryPrice = Number(entry.entry_price || price)
  return entry.side === 'BUY' ? (price - entryPrice) * qty : (entryPrice - price) * qty
}

function entryRealizedPnl(entry: RangeEntry): number {
  const partial = (entry.partial_exits ?? []).reduce((sum, exit) => sum + Number(exit.pnl || 0), 0)
  return partial + (entry.status === 'closed' ? Number(entry.pnl || 0) : 0)
}

function buildPnlSummary(nextEntries: RangeEntry[], price: number | null): PnlSummary {
  const openEntries = nextEntries.filter((entry) => entry.status === 'open')
  const closedEntries = nextEntries.filter((entry) => entry.status === 'closed')
  const pendingEntries = nextEntries.filter((entry) => entry.status === 'pending').length
  const rejectedEntries = nextEntries.filter((entry) => entry.status === 'rejected' || entry.status === 'cancelled').length
  const realized = nextEntries.reduce((sum, entry) => sum + entryRealizedPnl(entry), 0)
  const unrealized = nextEntries.reduce((sum, entry) => sum + entryUnrealizedPnl(entry, price), 0)
  const openQty = openEntries.reduce((sum, entry) => sum + qtyValue(entry.quantity), 0)
  const closedQty = closedEntries.reduce((sum, entry) => sum + qtyValue(entry.exit_filled_qty ?? entry.filled_qty ?? entry.quantity), 0)
  const filledQty = nextEntries.reduce((sum, entry) => sum + qtyValue(entry.filled_qty ?? entry.quantity), 0)
  const weightedOpenValue = openEntries.reduce((sum, entry) => sum + qtyValue(entry.quantity) * Number(entry.entry_price || 0), 0)
  return {
    realized: Number(realized.toFixed(2)),
    unrealized: Number(unrealized.toFixed(2)),
    total: Number((realized + unrealized).toFixed(2)),
    openEntries: openEntries.length,
    closedEntries: closedEntries.length,
    pendingEntries,
    rejectedEntries,
    totalEntries: nextEntries.length,
    openQty,
    filledQty,
    closedQty,
    avgEntryPrice: openQty > 0 ? Number((weightedOpenValue / openQty).toFixed(2)) : null,
    lastPrice: price,
  }
}

async function jsonOrNull<T>(response: Response): Promise<T | null> {
  const text = await response.text()
  if (!text.trim()) return null
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

function errorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    const candidate = record.detail ?? record.message ?? record.error
    if (typeof candidate === 'string') return candidate
    if (candidate && typeof candidate === 'object') {
      const msg = (candidate as Record<string, unknown>).message ?? (candidate as Record<string, unknown>).detail
      if (typeof msg === 'string') return msg
    }
  }
  return fallback
}

function isAuthFailure(message: string): boolean {
  const normalized = message.toLowerCase()
  return normalized.includes('unauthorized') || normalized.includes('invalid token') || normalized.includes('token expired')
}

function timeframeSeconds(timeframe: Timeframe): number {
  if (timeframe === '3m') return 180
  if (timeframe === '5m') return 300
  if (timeframe === '15m') return 900
  return 60
}

function mergeTickIntoCandles(current: Candle[], price: number, epochS: number, timeframe: Timeframe): Candle[] {
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(epochS) || epochS <= 0) return current
  const interval = timeframeSeconds(timeframe)
  const bucketS = Math.floor(epochS / interval) * interval
  const bucketMs = bucketS * 1000
  const last = current[current.length - 1]
  if (!last) {
    return [{ epoch_ms: bucketMs, open: price, high: price, low: price, close: price, volume: null }]
  }
  if (last.epoch_ms === bucketMs) {
    const next = current.slice()
    next[next.length - 1] = {
      ...last,
      high: Math.max(last.high, price),
      low: Math.min(last.low, price),
      close: price,
    }
    return next
  }
  if (last.epoch_ms < bucketMs) {
    return [
      ...current.slice(-1499),
      {
        epoch_ms: bucketMs,
        open: last.close,
        high: Math.max(last.close, price),
        low: Math.min(last.close, price),
        close: price,
        volume: null,
      },
    ]
  }
  return current
}

function instrumentBadge(instrument: Instrument | null): string {
  if (!instrument) return 'No instrument'
  if (instrument.instrument_type === 'OPT') {
    return `${instrument.display_name} ${instrument.option_type ?? ''}`
  }
  if (instrument.instrument_type === 'FUT') return `${instrument.display_name} FUT`
  return `${instrument.display_name} ${instrument.exchange}`
}

export default function RangeTrader({
  session,
  executionEnvironment,
  onExecutionEnvironmentChange,
  onAuthRequired,
  renderNav,
  onBack,
}: Props) {
  const chartHostRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const drawingRef = useRef(false)
  const draftPointRef = useRef<RangePoint | null>(null)
  const lineDragRef = useRef<LineDrag | null>(null)
  const selectedRoleRef = useRef<LineRole>('entry')
  const selectedShapeRef = useRef<LineShape>('trend')
  const candlesRef = useRef<Candle[]>([])
  const chartRequestRef = useRef(0)
  const fitChartOnNextCandlesRef = useRef(false)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchItems, setSearchItems] = useState<Instrument[]>([])
  const [searching, setSearching] = useState(false)
  const [instrument, setInstrument] = useState<Instrument | null>(null)
  const [timeframe, setTimeframe] = useState<Timeframe>('1m')
  const [candles, setCandles] = useState<Candle[]>([])
  const [chartError, setChartError] = useState('')
  const [loadingChart, setLoadingChart] = useState(false)
  const [chartStreamKey, setChartStreamKey] = useState('')
  const [chartStreamStatus, setChartStreamStatus] = useState('')
  const syntheticChartRef = useRef(false)
  const [setups, setSetups] = useState<RangeSetup[]>([])
  const [setupId, setSetupId] = useState<string | null>(null)
  const [lines, setLines] = useState<RangeLine[]>([])
  const [selectedRole, setSelectedRole] = useState<LineRole>('entry')
  const [selectedShape, setSelectedShape] = useState<LineShape>('trend')
  const [lineMenuOpen, setLineMenuOpen] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const [draftPoint, setDraftPoint] = useState<RangePoint | null>(null)
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null)
  const [lineDrag, setLineDrag] = useState<LineDrag | null>(null)
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY')
  const [quantity, setQuantity] = useState('1')
  const [orderType, setOrderType] = useState<'AGGRESSIVE_LIMIT' | 'MARKET' | 'LIMIT'>('AGGRESSIVE_LIMIT')
  const [limitPrice, setLimitPrice] = useState('')
  const [toleranceValue, setToleranceValue] = useState('0.05')
  const [toleranceMode, setToleranceMode] = useState<'percent' | 'ticks' | 'points'>('percent')
  const [maxLoss, setMaxLoss] = useState('')
  const [exitOnMaxLoss, setExitOnMaxLoss] = useState(true)
  const [status, setStatus] = useState<RangeStatus>('draft')
  const [events, setEvents] = useState<RangeEvent[]>([])
  const [entries, setEntries] = useState<RangeEntry[]>([])
  const [lineStates, setLineStates] = useState<Record<string, Record<string, unknown>>>({})
  const [lineRuntimeStatuses, setLineRuntimeStatuses] = useState<Record<string, LineRuntimeStatus>>({})
  const [optionUnderlying, setOptionUnderlying] = useState('NIFTY')
  const [selectedOption, setSelectedOption] = useState<SelectedOption | null>(null)
  const [chainOpen, setChainOpen] = useState(true)
  const [toolkitOpen, setToolkitOpen] = useState(false)
  const [resolvingOption, setResolvingOption] = useState(false)
  const [runtimeStatus, setRuntimeStatus] = useState('')
  const [runtimeConnected, setRuntimeConnected] = useState(false)
  const [livePrice, setLivePrice] = useState<number | null>(null)
  const [pnl, setPnl] = useState<PnlSummary>(() => buildPnlSummary([], null))
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [prodDisclaimer, setProdDisclaimer] = useState(false)
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 })

  const selectedLine = useMemo(
    () => lines.find((line) => line.id === selectedLineId) ?? null,
    [lines, selectedLineId],
  )
  const lastPrice = livePrice ?? (candles.length ? candles[candles.length - 1].close : null)
  const editingLocked = status === 'armed'
  const optionChain = useOptionChain({
    enabled: !session.is_demo && Boolean(session.access_token) && optionUnderlying.trim().length > 0,
    underlying: optionUnderlying.trim().toUpperCase() || 'NIFTY',
    sessionToken: session.access_token,
    deviceId: session.device_id,
    environment: executionEnvironment,
  })

  useEffect(() => {
    drawingRef.current = drawing
  }, [drawing])

  useEffect(() => {
    draftPointRef.current = draftPoint
  }, [draftPoint])

  useEffect(() => {
    selectedRoleRef.current = selectedRole
  }, [selectedRole])

  useEffect(() => {
    selectedShapeRef.current = selectedShape
  }, [selectedShape])

  useEffect(() => {
    candlesRef.current = candles
  }, [candles])

  function commitDrawPoint(point: RangePoint) {
    if (editingLocked) return
    const currentDraft = draftPointRef.current
    if (!currentDraft) {
      setDraftPoint(point)
      draftPointRef.current = point
      return
    }

    const id = `line_${Date.now()}`
    const role = selectedRoleRef.current
    const shape = selectedShapeRef.current
    const levelPoint = { ...point, price: point.price }
    setLines((current) => {
      const roleCount = current.filter((line) => line.role === role).length + 1
      return [
        ...current,
        {
          id,
          role,
          shape,
          label: `${roleLabels[role]} ${roleCount}`,
          trigger: 'touch',
          repeat_policy: 'once',
          reset_distance: null,
          close_buffer: null,
          armed: true,
          points: shape === 'level' ? [{ ...currentDraft, price: levelPoint.price }, levelPoint] : [currentDraft, point],
        },
      ]
    })
    setSelectedLineId(id)
    draftPointRef.current = null
    setDraftPoint(null)
    drawingRef.current = false
    setDrawing(false)
    setMessage(`${roleLabels[role]} line placed. Use the toolkit to tune trigger behaviour.`)
  }

  function chartPointFromCoordinates(x: number, y: number) {
    const chart = chartRef.current
    const candle = candleSeriesRef.current
    if (!chart || !candle) return null

    const price = candle.coordinateToPrice(y)
    if (price == null || !Number.isFinite(price)) return null

    const chartTime = chart.timeScale().coordinateToTime(x)
    const logical = chart.timeScale().coordinateToLogical(x)
    const currentCandles = candlesRef.current
    const fallbackTime = currentCandles.length
      ? Math.floor(currentCandles[currentCandles.length - 1].epoch_ms / 1000)
      : Math.floor(Date.now() / 1000)
    const seconds = timeframeSeconds(timeframe)
    const logicalTime = typeof logical === 'number' && Number.isFinite(logical) && currentCandles.length
      ? Math.round(fallbackTime + (logical - (currentCandles.length - 1)) * seconds)
      : fallbackTime
    const time = typeof chartTime === 'number' && Number.isFinite(chartTime) ? epochFromChartTime(chartTime) : logicalTime
    const logicalIndex = typeof logical === 'number' && Number.isFinite(logical) ? Number(logical) : undefined
    return {
      time: Number(time),
      price: Number(price),
      logical: logicalIndex,
    }
  }

  function handleDrawLayerClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (!drawingRef.current) return
    const host = chartHostRef.current
    if (!host) return
    const rect = host.getBoundingClientRect()
    const point = chartPointFromCoordinates(event.clientX - rect.left, event.clientY - rect.top)
    if (!point) {
      setMessage('Click inside the plotted candle area to place the line.')
      return
    }
    commitDrawPoint(point)
  }

  function pointFromPointerEvent(event: ReactPointerEvent<SVGElement>) {
    const host = chartHostRef.current
    if (!host) return null
    const rect = host.getBoundingClientRect()
    return chartPointFromCoordinates(event.clientX - rect.left, event.clientY - rect.top)
  }

  function startLineDrag(event: ReactPointerEvent<SVGElement>, line: RangeLine, mode: LineDrag['mode'], pointIndex: 0 | 1) {
    if (editingLocked) return
    if (drawingRef.current || line.points.length < 2) return
    const startPoint = pointFromPointerEvent(event)
    if (!startPoint) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const nextDrag = {
      lineId: line.id,
      mode,
      pointIndex,
      startPoint,
      originalPoints: line.points.map((point) => ({ ...point })),
    }
    lineDragRef.current = nextDrag
    setLineDrag(nextDrag)
    setSelectedLineId(line.id)
  }

  function handleLinePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = lineDragRef.current
    if (!drag) return
    const nextPoint = pointFromPointerEvent(event)
    if (!nextPoint) return
    event.preventDefault()
    const priceDelta = nextPoint.price - drag.startPoint.price
    const timeDelta = nextPoint.time - drag.startPoint.time
    const logicalDelta = typeof nextPoint.logical === 'number' && typeof drag.startPoint.logical === 'number'
      ? nextPoint.logical - drag.startPoint.logical
      : null

    setLines((current) =>
      current.map((line) => {
        if (line.id !== drag.lineId) return line
        if (drag.mode === 'endpoint') {
          const points = [...line.points]
          points[drag.pointIndex] = nextPoint
          return { ...line, points }
        }
        return {
          ...line,
          points: drag.originalPoints.map((point) => ({
            ...point,
            time: point.time + timeDelta,
            price: point.price + priceDelta,
            logical: typeof point.logical === 'number' && logicalDelta != null ? point.logical + logicalDelta : point.logical,
            last_time: undefined,
            offset_from_last: undefined,
            bar_offset_from_last: undefined,
          })),
        }
      }),
    )
  }

  function stopLineDrag(event?: ReactPointerEvent<SVGSVGElement>) {
    if (!lineDragRef.current) return
    if (event) {
      event.preventDefault()
      event.stopPropagation()
    }
    lineDragRef.current = null
    setLineDrag(null)
  }

  useEffect(() => {
    if (!chartHostRef.current) return
    const host = chartHostRef.current
    const chart = createChart(host, {
      width: host.clientWidth,
      height: 560,
      layout: {
        background: { color: '#06080d' },
        textColor: '#8b97a8',
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: '#111827' },
        horzLines: { color: '#111827' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#334155', style: 1, labelBackgroundColor: '#0f172a' },
        horzLine: { color: '#334155', style: 1, labelBackgroundColor: '#0f172a' },
      },
      rightPriceScale: {
        borderColor: '#182235',
        scaleMargins: { top: 0.05, bottom: 0.1 },
      },
      timeScale: {
        borderColor: '#182235',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 8,
        barSpacing: 9,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,
      },
    })
    const candle = chart.addCandlestickSeries({
      upColor: '#16a34a',
      downColor: '#dc2626',
      wickUpColor: '#16a34a',
      wickDownColor: '#dc2626',
      borderUpColor: '#16a34a',
      borderDownColor: '#dc2626',
    })
    const volume = chart.addHistogramSeries({
      priceScaleId: 'vol',
      priceFormat: { type: 'volume' },
      priceLineVisible: false,
      lastValueVisible: false,
    })
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.88, bottom: 0.02 } })
    chartRef.current = chart
    candleSeriesRef.current = candle
    volumeSeriesRef.current = volume

    const resize = new ResizeObserver(() => {
      const width = Math.max(1, host.clientWidth)
      chart.applyOptions({ width, height: 560 })
      setCanvasSize({ width, height: 560 })
    })
    resize.observe(host)
    setCanvasSize({ width: Math.max(1, host.clientWidth), height: 560 })

    chart.subscribeClick((param) => {
      if (!drawingRef.current || !param.point || !candleSeriesRef.current) return
      const point = chartPointFromCoordinates(param.point.x, param.point.y)
      if (point) commitDrawPoint(point)
    })

    return () => {
      resize.disconnect()
      chart.remove()
      chartRef.current = null
      candleSeriesRef.current = null
      volumeSeriesRef.current = null
    }
  }, [])

  useEffect(() => {
    const candle = candleSeriesRef.current
    const volume = volumeSeriesRef.current
    if (!candle || !volume) return
    candle.setData(
      candles.map((item) => ({
        time: chartTimeFromEpoch(Math.floor(item.epoch_ms / 1000)),
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
      })),
    )
    volume.setData(
      candles.map((item) => ({
        time: chartTimeFromEpoch(Math.floor(item.epoch_ms / 1000)),
        value: item.volume ?? 0,
        color: item.close >= item.open ? 'rgba(34,197,94,.32)' : 'rgba(239,68,68,.32)',
      })),
    )
    if (fitChartOnNextCandlesRef.current && candles.length > 0) {
      chartRef.current?.timeScale().fitContent()
      fitChartOnNextCandlesRef.current = false
    }
  }, [candles])

  useEffect(() => {
    const selectedQuery = instrument?.display_name?.trim().toUpperCase()
    const normalizedQuery = query.trim().toUpperCase()
    if (!searchOpen || query.trim().length < 1 || session.is_demo || (selectedQuery && normalizedQuery === selectedQuery)) {
      setSearchItems([])
      setSearching(false)
      return
    }
    const handle = window.setTimeout(async () => {
      setSearching(true)
      try {
        const response = await fetch('/api/range-trader/instruments/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_token: session.access_token,
            device_id: session.device_id,
            environment: executionEnvironment,
            query,
            limit: 16,
          }),
        })
        const payload = await jsonOrNull<{ items: Instrument[] }>(response)
        if (!response.ok) throw new Error(errorMessage(payload, 'Instrument search failed.'))
        setSearchItems(payload?.items ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Instrument search failed.')
      } finally {
        setSearching(false)
      }
    }, 180)
    return () => window.clearTimeout(handle)
  }, [executionEnvironment, instrument?.display_name, query, searchOpen, session.access_token, session.device_id, session.is_demo])

  useEffect(() => {
    void loadSetups()
  }, [executionEnvironment, session.account_id])

  useEffect(() => {
    if (!instrument || session.is_demo) return
    void loadChart(instrument, timeframe)
    setLivePrice(null)
  }, [instrument, timeframe])

  useEffect(() => {
    if (session.is_demo || !instrument || !chartStreamKey) {
      setChartStreamStatus('')
      return
    }
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/range-trader/quotes`)
    let closedByEffect = false
    setChartStreamStatus('Connecting live chart stream...')

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          session_token: session.access_token,
          device_id: session.device_id,
          environment: executionEnvironment,
          ref_id: instrument.ref_id,
          timeframe,
        }),
      )
    }

    ws.onmessage = (event: MessageEvent<string>) => {
      if (closedByEffect) return
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(event.data) as Record<string, unknown>
      } catch {
        return
      }
      const type = String(msg.type || '')
      if (type === 'status') {
        const nextStatus = String(msg.message || '')
        if (syntheticChartRef.current && nextStatus.toLowerCase().includes('live')) {
          setChartStreamStatus('Historical option candles unavailable; live quote stream is active and building candles from new ticks.')
        } else {
          setChartStreamStatus(nextStatus)
        }
        return
      }
      if (type === 'auth_error') {
        const authMessage = String(msg.message || `${executionEnvironment} chart stream authentication failed.`)
        setChartStreamStatus(authMessage)
        onAuthRequired(executionEnvironment, authMessage)
        return
      }
      if (type === 'tick') {
        const price = Number(msg.price)
        const epochS = Number(msg.epoch_s)
        if (Number.isFinite(price) && price > 0) {
          setLivePrice(price)
          setCandles((current) => mergeTickIntoCandles(current, price, epochS, timeframe))
        }
      }
    }

    ws.onerror = () => {
      if (!closedByEffect) setChartStreamStatus('Range chart stream error.')
    }

    ws.onclose = () => {
      if (!closedByEffect) setChartStreamStatus((current) => current || 'Range chart stream disconnected.')
    }

    return () => {
      closedByEffect = true
      ws.close()
    }
  }, [chartStreamKey, executionEnvironment, instrument?.ref_id, session.access_token, session.device_id, session.is_demo, timeframe])

  useEffect(() => {
    if (session.is_demo || status !== 'armed' || !setupId) {
      setRuntimeConnected(false)
      return
    }
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/range-trader`)
    let closedByEffect = false
    setRuntimeStatus('Connecting live range runtime...')

    ws.onopen = () => {
      setRuntimeConnected(true)
      ws.send(
        JSON.stringify({
          session_token: session.access_token,
          device_id: session.device_id,
          account_id: session.account_id,
          environment: executionEnvironment,
          setup_id: setupId,
        }),
      )
    }

    ws.onmessage = (event: MessageEvent<string>) => {
      if (closedByEffect) return
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(event.data) as Record<string, unknown>
      } catch {
        return
      }
      const type = String(msg.type || '')
      if (type === 'status') {
        const nextStatus = String(msg.message || '')
        setRuntimeStatus(nextStatus)
        if (isAuthFailure(nextStatus)) {
          onAuthRequired(executionEnvironment, `${executionEnvironment} session was rejected by Nubra live runtime. Please log in again.`)
        }
        return
      }
      if (type === 'auth_error') {
        const authMessage = String(msg.message || `${executionEnvironment} authentication failed.`)
        setRuntimeStatus(authMessage)
        setRuntimeConnected(false)
        onAuthRequired(executionEnvironment, authMessage)
        return
      }
      if (type === 'tick') {
        const price = Number(msg.price)
        if (Number.isFinite(price) && price > 0) setLivePrice(price)
        return
      }
      if (type === 'line_status') {
        const incoming = Array.isArray(msg.lines) ? (msg.lines as LineRuntimeStatus[]) : []
        setLineRuntimeStatuses(Object.fromEntries(incoming.map((line) => [line.id, line])))
        return
      }
      if (type === 'pnl') {
        setPnl((current) => ({
          ...current,
          realized: Number(msg.realized_pnl || 0),
          unrealized: Number(msg.unrealized_pnl || 0),
          total: Number(msg.total_pnl || 0),
          openEntries: msg.open_entries == null ? current.openEntries : Number(msg.open_entries),
        }))
        return
      }
      if (type === 'runtime_init') {
        const incoming = Array.isArray(msg.entries) ? (msg.entries as RangeEntry[]) : []
        setEntries(incoming)
        if (msg.line_states && typeof msg.line_states === 'object') {
          setLineStates(msg.line_states as Record<string, Record<string, unknown>>)
        }
        setPnlFromEntries(incoming, livePrice)
        return
      }
      if (type === 'entries') {
        const incoming = Array.isArray(msg.entries) ? (msg.entries as RangeEntry[]) : []
        setEntries(incoming)
        if (msg.line_states && typeof msg.line_states === 'object') {
          setLineStates(msg.line_states as Record<string, Record<string, unknown>>)
        }
        setPnlFromEntries(incoming, livePrice)
        return
      }
      if (type === 'event') {
        const nextEvent = msg.event as RangeEvent
        if (nextEvent?.id) {
          setEvents((current) => [nextEvent, ...current].slice(0, 100))
          if (nextEvent.event_type === 'entry_order_sent' && nextEvent.payload) {
            setEntries((current) => {
              const entry = nextEvent.payload as unknown as RangeEntry
              if (!entry.id || current.some((item) => item.id === entry.id)) return current
              const next = [entry, ...current]
              setPnlFromEntries(next, livePrice)
              return next
            })
          }
        }
        return
      }
      if (type === 'runtime_stopped') {
        setRuntimeStatus(`Runtime stopped: ${String(msg.reason || 'stopped')}`)
        setRuntimeConnected(false)
        if (String(msg.reason || '') === 'max_loss') setStatus('risk_locked')
      }
    }

    ws.onerror = () => {
      if (!closedByEffect) {
        setRuntimeStatus('Range runtime websocket error.')
        setRuntimeConnected(false)
      }
    }

    ws.onclose = () => {
      if (!closedByEffect) {
        setRuntimeConnected(false)
        setRuntimeStatus((current) => current || 'Range runtime disconnected.')
      }
    }

    return () => {
      closedByEffect = true
      ws.close()
      setRuntimeConnected(false)
    }
  }, [executionEnvironment, session.account_id, session.access_token, session.device_id, session.is_demo, setupId, status])

  useEffect(() => {
    setPnlFromEntries(entries, livePrice)
  }, [entries, livePrice])

  function setPnlFromEntries(nextEntries: RangeEntry[], price: number | null) {
    setPnl(buildPnlSummary(nextEntries, price))
  }

  async function loadSetups() {
    if (session.is_demo) return
    try {
      const response = await fetch('/api/range-trader/setups/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_token: session.access_token,
          device_id: session.device_id,
          account_id: session.account_id,
          environment: executionEnvironment,
        }),
      })
      const payload = await jsonOrNull<{ setups: RangeSetup[] }>(response)
      if (!response.ok) throw new Error(errorMessage(payload, 'Unable to load parked range setups.'))
      setSetups(payload?.setups ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load parked range setups.')
    }
  }

  async function loadChart(nextInstrument: Instrument, nextTimeframe = timeframe) {
    const requestId = chartRequestRef.current + 1
    chartRequestRef.current = requestId
    setLoadingChart(true)
    setChartError('')
    setChartStreamKey('')
    setChartStreamStatus('')
    syntheticChartRef.current = false
    fitChartOnNextCandlesRef.current = true
    setCandles([])
    try {
      const response = await fetch('/api/range-trader/chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_token: session.access_token,
          device_id: session.device_id,
          environment: executionEnvironment,
          symbol: nextInstrument.chart_symbol || nextInstrument.display_name || nextInstrument.symbol,
          ref_id: nextInstrument.ref_id,
          display_name: nextInstrument.display_name,
          chart_symbol: nextInstrument.chart_symbol,
          exchange: nextInstrument.exchange,
          instrument_type: nextInstrument.instrument_type,
          derivative_type: nextInstrument.derivative_type,
          option_type: nextInstrument.option_type,
          expiry: nextInstrument.expiry,
          strike_price: nextInstrument.strike_price,
          ltp_hint: nextInstrument.ltp_hint,
          timeframe: nextTimeframe,
          lookback_days: 7,
        }),
      })
      const payload = await jsonOrNull<{ candles: Candle[]; synthetic?: boolean; synthetic_reason?: string | null }>(response)
      if (!response.ok) throw new Error(errorMessage(payload, 'Unable to load chart.'))
      if (chartRequestRef.current !== requestId) return
      const nextCandles = payload?.candles ?? []
      setCandles(nextCandles)
      if (nextCandles.length === 0) {
        setChartError(`No candles returned for ${nextInstrument.display_name}. Try another contract or timeframe.`)
      } else {
        if (payload?.synthetic) {
          syntheticChartRef.current = true
          setChartStreamStatus(payload.synthetic_reason || 'Historical option candles unavailable; using live quote fallback.')
        }
        setChartStreamKey(`${nextInstrument.ref_id}:${nextTimeframe}:${Date.now()}`)
      }
    } catch (err) {
      if (chartRequestRef.current !== requestId) return
      setChartError(err instanceof Error ? err.message : 'Unable to load chart.')
    } finally {
      if (chartRequestRef.current === requestId) setLoadingChart(false)
    }
  }

  function applySetup(setup: RangeSetup) {
    setSetupId(setup.id)
    setInstrument({
      symbol: setup.symbol,
      display_name: setup.display_name,
      exchange: setup.exchange,
      instrument_type: setup.instrument_type,
      derivative_type: setup.derivative_type,
      option_type: setup.option_type,
      expiry: setup.expiry,
      strike_price: setup.strike_price,
      chart_symbol: setup.display_name,
      ltp_hint: setup.payload.entry_price ?? null,
      ref_id: setup.ref_id,
      tick_size: setup.tick_size,
      lot_size: setup.lot_size,
    })
    setQuery(setup.display_name)
    setTimeframe(setup.timeframe)
    setLines(setup.payload.lines ?? [])
    setEntries(setup.payload.entries ?? [])
    setLineStates(setup.payload.line_states ?? {})
    setPnlFromEntries(setup.payload.entries ?? [], livePrice)
    setSide(setup.side)
    setQuantity(String(setup.quantity))
    setOrderType(setup.order_type)
    setLimitPrice(setup.payload.limit_price == null ? '' : String(setup.payload.limit_price))
    setToleranceValue(String(setup.tolerance_value))
    setToleranceMode(setup.tolerance_mode)
    setMaxLoss(setup.max_loss == null ? '' : String(setup.max_loss))
    setExitOnMaxLoss(setup.exit_on_max_loss)
    setStatus(setup.status)
    setMessage(`Restored parked setup for ${setup.display_name}.`)
    void loadEvents(setup.id)
  }

  async function saveSetup(nextStatus: RangeStatus = status): Promise<RangeSetup | null> {
    if (editingLocked && nextStatus === status) {
      setError('Pause the deployed Range Trader before editing or saving lines.')
      return null
    }
    if (!instrument) {
      setError('Select an instrument before saving the range setup.')
      return null
    }
    if (nextStatus === 'armed' && orderType === 'LIMIT' && (!limitPrice.trim() || Number(limitPrice) <= 0)) {
      setError('Enter a valid limit price before deploying a LIMIT Range Trader setup.')
      return null
    }
    const response = await fetch('/api/range-trader/setups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_token: session.access_token,
        device_id: session.device_id,
        account_id: session.account_id,
        environment: executionEnvironment,
        id: setupId,
        title: `${instrument.display_name} Range`,
        instrument,
        timeframe,
        side,
        quantity: Math.max(1, Number(quantity) || 1),
        order_type: orderType,
        tolerance_value: Math.max(0, Number(toleranceValue) || 0),
        tolerance_mode: toleranceMode,
        max_loss: maxLoss.trim() ? Math.max(0, Number(maxLoss) || 0) : null,
        exit_on_max_loss: exitOnMaxLoss,
        status: nextStatus,
	        payload: {
	          lines,
	          entries,
		          line_states: lineStates,
		          position_status: entries.some((entry) => entry.status === 'open') ? 'in_position' : 'idle',
		          open_quantity: entries.reduce((sum, entry) => entry.status === 'open' ? sum + Number(entry.quantity || 0) : sum, 0),
		          limit_price: orderType === 'LIMIT' && limitPrice.trim() ? Number(limitPrice) : null,
		          notes: null,
		        },
      }),
    })
    const payload = await jsonOrNull<{ setup: RangeSetup }>(response)
    if (!response.ok || !payload?.setup) throw new Error(errorMessage(payload, 'Unable to save range setup.'))
    setSetupId(payload.setup.id)
    setStatus(payload.setup.status)
    setSetups((current) => [payload.setup, ...current.filter((item) => item.id !== payload.setup.id)])
    setMessage(`Saved ${payload.setup.display_name} range setup.`)
    await loadEvents(payload.setup.id)
    return payload.setup
  }

  async function loadEvents(id = setupId) {
    if (!id) return
    try {
      const response = await fetch('/api/range-trader/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setup_id: id,
          account_id: session.account_id,
          environment: executionEnvironment,
          session_token: session.access_token,
          device_id: session.device_id,
        }),
      })
      const payload = await jsonOrNull<{ events: RangeEvent[] }>(response)
      if (response.ok) setEvents(payload?.events ?? [])
    } catch {
      // Events are non-critical for chart work.
    }
  }

  async function control(action: 'arm' | 'pause' | 'stop') {
    setError('')
    try {
      let setup: RangeSetup | null = null
      if (action === 'arm') {
        setup = await saveSetup('armed')
        if (!setup) return
      } else {
        if (!setupId) {
          setError(`Save the setup before trying to ${action} it.`)
          return
        }
        setup = setups.find((item) => item.id === setupId) ?? null
      }
      const response = await fetch(`/api/range-trader/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setup_id: setup?.id ?? setupId,
          account_id: session.account_id,
          environment: executionEnvironment,
          session_token: session.access_token,
          device_id: session.device_id,
        }),
      })
      const payload = await jsonOrNull<{ setup: RangeSetup }>(response)
      if (!response.ok || !payload?.setup) throw new Error(errorMessage(payload, `Unable to ${action} setup.`))
      setup = payload.setup
      setStatus(setup.status)
      setSetups((current) => [setup!, ...current.filter((item) => item.id !== setup!.id)])
      await loadEvents(setup.id)
      setMessage(action === 'arm' ? `${setup.display_name} is armed.` : `${setup.display_name} ${action}ed.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : `Unable to ${action} setup.`)
    }
  }

  async function killSwitch() {
    setError('')
    try {
      let setup: RangeSetup | null = null
      if (status === 'armed') {
        if (!setupId) {
          setError('No deployed setup is available for the kill switch.')
          return
        }
        setup = setups.find((item) => item.id === setupId) ?? null
      } else {
        setup = await saveSetup('stopped')
        if (!setup) return
      }
      const response = await fetch('/api/range-trader/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setup_id: setup?.id ?? setupId,
          account_id: session.account_id,
          environment: executionEnvironment,
          session_token: session.access_token,
          device_id: session.device_id,
          exit_open_entries: true,
        }),
      })
      const payload = await jsonOrNull<{ setup: RangeSetup }>(response)
      if (!response.ok || !payload?.setup) throw new Error(errorMessage(payload, 'Unable to engage kill switch.'))
      setup = payload.setup
      setStatus(setup.status)
      setEntries(setup.payload.entries ?? [])
      setLineStates(setup.payload.line_states ?? {})
      setPnlFromEntries(setup.payload.entries ?? [], livePrice)
      setSetups((current) => [setup!, ...current.filter((item) => item.id !== setup!.id)])
      await loadEvents(setup.id)
      setMessage(`Kill switch engaged for ${setup.display_name}. Open tile entries were sent for exit.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to engage kill switch.')
    }
  }

  async function selectOptionFromChain(next: SelectedOption) {
    if (editingLocked) {
      setMessage('Pause the deployed Range Trader before changing instruments.')
      return
    }
    setSelectedOption(next)
    setResolvingOption(true)
    setError('')
    setChartError('')
    try {
      const response = await fetch('/api/range-trader/options/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_token: session.access_token,
          device_id: session.device_id,
          environment: executionEnvironment,
          underlying: next.underlying,
          strike_price: next.strike,
          option_type: next.optionType,
          expiry: next.expiry,
          exchange: 'NFO',
          ref_id: next.ref_id,
          ltp_hint: next.ltp,
        }),
      })
      const payload = await jsonOrNull<{ instrument: Instrument }>(response)
      if (!response.ok || !payload?.instrument) throw new Error(errorMessage(payload, 'Unable to resolve selected option.'))
      chooseInstrument(payload.instrument)
      setMessage(`Loaded ${payload.instrument.display_name} from option chain.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to resolve selected option.')
    } finally {
      setResolvingOption(false)
    }
  }

  function handleStart() {
    if (executionEnvironment === 'PROD') {
      setProdDisclaimer(true)
      return
    }
    void control('arm')
  }

  function activateLineTool(role: LineRole) {
    if (editingLocked) {
      setMessage('Pause the deployed Range Trader before changing lines.')
      return
    }
    setSelectedRole(role)
    selectedRoleRef.current = role
    setLineMenuOpen(false)
    setSelectedLineId(null)
    setDraftPoint(null)
    draftPointRef.current = null
    setDrawing(true)
    drawingRef.current = true
    setMessage(`${roleLabels[role]} line selected. Click the chart twice to place it.`)
  }

  function updateSelectedLine(patch: Partial<RangeLine>) {
    if (editingLocked) {
      setMessage('Pause the deployed Range Trader before changing lines.')
      return
    }
    if (!selectedLineId) return
    setLines((current) =>
      current.map((line) => (line.id === selectedLineId ? { ...line, ...patch } : line)),
    )
  }

  function handleTimeframeChange(nextTimeframe: Timeframe) {
    if (editingLocked) {
      setMessage('Pause the deployed Range Trader before changing timeframe.')
      return
    }
    if (nextTimeframe === timeframe) return
    setTimeframe(nextTimeframe)
  }

  function projectedLine(line: RangeLine) {
    const chart = chartRef.current
    const candle = candleSeriesRef.current
    if (!chart || !candle || line.points.length < 2) return null
    const [a, b] = line.points
    if ((line.shape ?? 'level') !== 'trend') {
      const levelPrice = Number(b.price || a.price || 0)
      const y = candle.priceToCoordinate(levelPrice)
      if (y == null) return null
      const width = Math.max(1, canvasSize.width || chartHostRef.current?.clientWidth || 1)
      return {
        x1: 0,
        x2: width,
        y1: y,
        y2: y,
        handleX1: pointToCoordinate(a) ?? 0,
        handleX2: pointToCoordinate(b) ?? width,
        handleY1: y,
        handleY2: y,
        labelX: Math.max(6, Math.min(width - 80, width - 70)),
        labelY: y,
      }
    }
    const logicalA = logicalForPointTime(a)
    const logicalB = logicalForPointTime(b)
    if (logicalA == null || logicalB == null) return null
    const handleX1 = chart.timeScale().logicalToCoordinate(logicalA as Logical)
    const handleX2 = chart.timeScale().logicalToCoordinate(logicalB as Logical)
    const handleY1 = candle.priceToCoordinate(a.price)
    const handleY2 = candle.priceToCoordinate(b.price)
    if (handleX1 == null || handleX2 == null || handleY1 == null || handleY2 == null) return null
    const width = Math.max(1, canvasSize.width || chartHostRef.current?.clientWidth || 1)
    const labelX = Math.max(6, Math.min(width - 90, Math.max(handleX1, handleX2) + 6))
    const labelY = handleX2 >= handleX1 ? handleY2 : handleY1
    return { x1: handleX1, x2: handleX2, y1: handleY1, y2: handleY2, handleX1, handleX2, handleY1, handleY2, labelX, labelY }
  }

  function currentLinePrice(line: RangeLine) {
    const epochS = candlesRef.current.length
      ? Math.floor(candlesRef.current[candlesRef.current.length - 1].epoch_ms / 1000)
      : Math.floor(Date.now() / 1000)
    if (line.points.length < 2) return null
    const [first, second] = line.points
    if ((line.shape ?? 'level') !== 'trend') return Number(second.price || first.price || 0) || null
    const x1 = Number(first.time || 0)
    const y1 = Number(first.price || 0)
    const x2 = Number(second.time || 0)
    const y2 = Number(second.price || 0)
    if (y1 <= 0 || y2 <= 0) return null
    if (x1 === x2) return y2
    return y1 + ((epochS - x1) / (x2 - x1)) * (y2 - y1)
  }

  function pointToCoordinate(point: RangePoint) {
    const chart = chartRef.current
    if (!chart) return null
    const logical = logicalForPointTime(point)
    return logical == null ? null : chart.timeScale().logicalToCoordinate(logical as Logical)
  }

  function logicalForPointTime(point: RangePoint) {
    const currentCandles = candlesRef.current
    if (!currentCandles.length) {
      return typeof point.logical === 'number' && Number.isFinite(point.logical) ? point.logical : null
    }

    const epochS = Number(point.time)
    const firstTime = Math.floor(currentCandles[0].epoch_ms / 1000)
    const lastIndex = currentCandles.length - 1
    const lastTime = Math.floor(currentCandles[lastIndex].epoch_ms / 1000)
    const seconds = timeframeSeconds(timeframe)

    if (epochS <= firstTime) return (epochS - firstTime) / seconds
    if (epochS >= lastTime) return lastIndex + (epochS - lastTime) / seconds

    for (let index = 0; index < lastIndex; index += 1) {
      const start = Math.floor(currentCandles[index].epoch_ms / 1000)
      const end = Math.floor(currentCandles[index + 1].epoch_ms / 1000)
      if (epochS >= start && epochS <= end) {
        const span = Math.max(1, end - start)
        return index + (epochS - start) / span
      }
    }

    if (typeof point.bar_offset_from_last === 'number' && Number.isFinite(point.bar_offset_from_last)) {
      return lastIndex + point.bar_offset_from_last
    }

    if (typeof point.offset_from_last === 'number' && Number.isFinite(point.offset_from_last)) {
      return lastIndex + point.offset_from_last / seconds
    }

    return typeof point.logical === 'number' && Number.isFinite(point.logical) ? point.logical : null
  }

  function chooseInstrument(next: Instrument) {
    if (editingLocked) {
      setMessage('Pause the deployed Range Trader before changing instruments.')
      return
    }
    setInstrument(next)
    setQuery(next.display_name)
    setSearchItems([])
    setSearchOpen(false)
    setLoadingChart(true)
    setChartError('')
    setChartStreamKey('')
    setChartStreamStatus('')
    setCandles([])
    setSetupId(null)
    setLines([])
    setStatus('draft')
    setEvents([])
    setEntries([])
    setLineStates({})
    setLineRuntimeStatuses({})
    setPnl(buildPnlSummary([], null))
    setRuntimeStatus('')
    setLivePrice(null)
  }

  function handleSave(event: FormEvent) {
    event.preventDefault()
    setError('')
    void saveSetup().catch((err) => setError(err instanceof Error ? err.message : 'Unable to save setup.'))
  }

  return (
    <div className="range-page">
      {renderNav('Range Trader')}
      <main className="range-main">
        <header className="range-head">
          <div>
            <button type="button" className="ghost-inline" onClick={onBack}>Back to Dashboard</button>
            <span className="range-eyebrow">NUBRA RANGE EXECUTION</span>
            <h1>Range Trader</h1>
            <p>Park range lines, arm touch-based entries, and track every setup per user across UAT and PROD.</p>
          </div>
          <div className="range-env">
            {(['UAT', 'PROD'] as const).map((env) => (
              <button
	                key={env}
	                type="button"
	                className={executionEnvironment === env ? 'range-env-btn active' : 'range-env-btn'}
	                onClick={() => onExecutionEnvironmentChange(env)}
	                disabled={editingLocked}
	              >
                {env}
              </button>
            ))}
          </div>
        </header>

        <section className={chainOpen ? 'range-workbench' : 'range-workbench chain-collapsed'}>
          <div className="range-chart-column">
            <div className="range-toolbar">
              <div className="range-search">
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value)
                    setSearchOpen(true)
                  }}
                  onFocus={() => {
                    if (query.trim().toUpperCase() !== instrument?.display_name?.trim().toUpperCase()) setSearchOpen(true)
                  }}
                  onBlur={() => window.setTimeout(() => setSearchOpen(false), 140)}
	                  placeholder="Search EQ, FUT, OPT..."
	                  disabled={session.is_demo || editingLocked}
	                />
                {searchOpen && (searchItems.length || searching) ? (
                  <div className="range-search-menu">
                    {searching ? <div className="range-search-row muted">Searching instruments...</div> : null}
                    {searchItems.map((item) => (
                      <button key={`${item.ref_id}-${item.exchange}`} type="button" onClick={() => chooseInstrument(item)}>
                        <strong>{item.display_name}</strong>
                        <span>{item.exchange} / {item.instrument_type}{item.option_type ? ` / ${item.option_type}` : ''}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
	              <div className="range-timeframes">
	                {timeframes.map((item) => (
	                  <button key={item} className={timeframe === item ? 'active' : ''} onClick={() => handleTimeframeChange(item)} type="button" disabled={editingLocked}>
	                    {item}
	                  </button>
	                ))}
	              </div>
		              <div className="range-timeframes">
		                {(['BUY', 'SELL'] as const).map((item) => (
		                  <button key={item} className={side === item ? 'active' : ''} onClick={() => setSide(item)} type="button" disabled={editingLocked}>
		                    {item}
		                  </button>
		                ))}
		              </div>
		              <div className="range-timeframes">
		                {(['level', 'trend'] as LineShape[]).map((item) => (
		                  <button key={item} className={selectedShape === item ? 'active' : ''} onClick={() => setSelectedShape(item)} type="button" disabled={editingLocked}>
		                    {item === 'level' ? 'Level' : 'Trend'}
		                  </button>
		                ))}
		              </div>
	              <div className="range-line-dropdown">
	                <button
                  type="button"
                  className={drawing ? 'range-line-draw-trigger active' : 'range-line-draw-trigger'}
                  style={{ '--role-color': roleColors[selectedRole] } as React.CSSProperties}
	                  disabled={!instrument || candles.length === 0 || editingLocked}
                  onClick={() => activateLineTool(selectedRole)}
                >
	                  <span>{drawing ? 'Drawing' : 'Line'}</span>
	                  <strong>{roleLabels[selectedRole]}</strong>
	                  <em>{selectedShape === 'trend' ? 'Trend' : 'Level'}</em>
	                  <small>▾</small>
                </button>
                <button
                  type="button"
                  className="range-line-caret"
                  style={{ '--role-color': roleColors[selectedRole] } as React.CSSProperties}
	                  disabled={!instrument || candles.length === 0 || editingLocked}
                  onClick={() => setLineMenuOpen((value) => !value)}
                  aria-label="Choose line type"
                >
                  v
                </button>
                {lineMenuOpen ? (
                  <div className="range-line-menu">
                    {(Object.keys(roleLabels) as LineRole[]).map((role) => (
                      <button
                        key={role}
                        type="button"
                        style={{ '--role-color': roleColors[role] } as React.CSSProperties}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => activateLineTool(role)}
                      >
                        {roleLabels[role]}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className={chainOpen ? 'range-chain-toggle active' : 'range-chain-toggle'}
                onClick={() => setChainOpen((value) => !value)}
              >
                Chain
              </button>
            </div>

            <div className={drawing ? 'range-chart-shell drawing' : lineDrag ? 'range-chart-shell editing' : 'range-chart-shell'}>
              <div className="range-chart-topline">
      <div>
        <span>{instrumentBadge(instrument)}</span>
        <strong>{fmt(lastPrice)}</strong>
      </div>
      <div>
                  <span>{loadingChart ? 'Loading candles' : `${candles.length} candles`}</span>
                  {chartError ? <span className="range-chart-status">{chartError}</span> : null}
                  {!chartError && chartStreamStatus ? <span>{chartStreamStatus}</span> : null}
                  <span>{runtimeConnected ? 'LIVE RUNTIME' : status.toUpperCase()}</span>
      </div>
              </div>
              <div ref={chartHostRef} className={drawing ? 'range-chart-host drawing' : 'range-chart-host'} />
              <svg
                className={drawing ? 'range-line-layer drawing' : 'range-line-layer'}
                width={canvasSize.width}
                height={canvasSize.height}
                onPointerMove={handleLinePointerMove}
                onPointerUp={stopLineDrag}
                onPointerCancel={stopLineDrag}
              >
                {lines.map((line) => {
                  const coords = projectedLine(line)
                  if (!coords) return null
                  const selected = selectedLineId === line.id
                  return (
                    <g key={line.id} className={selected ? 'range-line-group selected' : 'range-line-group'} onClick={() => setSelectedLineId(line.id)}>
                      <line
                        className="range-line-hitbox"
                        x1={coords.x1}
                        y1={coords.y1}
                        x2={coords.x2}
                        y2={coords.y2}
                        onPointerDown={(event) => startLineDrag(event, line, 'body', 0)}
                      />
                      <line
                        x1={coords.x1}
                        y1={coords.y1}
                        x2={coords.x2}
                        y2={coords.y2}
                        stroke={roleColors[line.role]}
                        strokeWidth={selected ? 2 : 1.35}
                        opacity={selected ? 0.9 : 0.72}
                        strokeDasharray={line.armed ? '0' : '6 5'}
                        onPointerDown={(event) => startLineDrag(event, line, 'body', 0)}
                      />
                      {selected ? (
                        <>
                          <circle
                            className="range-line-handle"
                            cx={coords.handleX1}
                            cy={coords.handleY1}
                            r="4"
                            fill={roleColors[line.role]}
                            onPointerDown={(event) => startLineDrag(event, line, 'endpoint', 0)}
                          />
                          <circle
                            className="range-line-handle"
                            cx={coords.handleX2}
                            cy={coords.handleY2}
                            r="4"
                            fill={roleColors[line.role]}
                            onPointerDown={(event) => startLineDrag(event, line, 'endpoint', 1)}
                          />
                        </>
                      ) : null}
	                      <rect
	                        x={(coords.labelX ?? coords.x2 + 6)}
	                        y={(coords.labelY ?? coords.y2) - 24}
	                        width={Math.max(52, line.label.length * 7 + 14)}
                        height="18"
                        rx="3"
                        fill={roleColors[line.role]}
                        opacity="0.82"
                        onPointerDown={(event) => startLineDrag(event, line, 'body', 0)}
                      />
	                      <text
	                        x={(coords.labelX ?? coords.x2 + 6) + 7}
	                        y={(coords.labelY ?? coords.y2) - 11}
                        fill="#020617"
                        fontSize="10"
                        fontWeight="700"
                        onPointerDown={(event) => startLineDrag(event, line, 'body', 0)}
                      >
                        {line.label.toUpperCase()}
                      </text>
                    </g>
                  )
                })}
                {draftPoint ? (
                  <circle
                    cx={pointToCoordinate(draftPoint) ?? -100}
                    cy={candleSeriesRef.current?.priceToCoordinate(draftPoint.price) ?? -100}
                    r="4"
                    fill={roleColors[selectedRole]}
                  />
                ) : null}
              </svg>
              {drawing ? <div className="range-draw-capture" onClick={handleDrawLayerClick} /> : null}
              {drawing ? (
                <div className="range-draw-hint">
                  {draftPoint ? `Click the second point for ${roleLabels[selectedRole]}` : `Click the first point for ${roleLabels[selectedRole]}`}
                </div>
              ) : null}
              {chartError ? <div className="range-chart-error">{chartError}</div> : null}
              {!instrument ? <div className="range-chart-empty">Search a Nubra instrument to load the range chart.</div> : null}
            </div>
          </div>

          {chainOpen ? (
          <aside className="range-side">
            <div className="range-chain-card">
              <div className="range-chain-head">
                <div>
                  <span className="range-panel-label">Option Chain</span>
                  <strong>{optionUnderlying.toUpperCase()}</strong>
                </div>
	                  <input
	                  value={optionUnderlying}
	                  onChange={(event) => setOptionUnderlying(event.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
	                  placeholder="NIFTY"
	                  aria-label="Option chain underlying"
	                  disabled={editingLocked}
	                />
              </div>
              {resolvingOption ? <div className="range-msg compact">Loading selected strike...</div> : null}
              <OptionChainTable
                data={optionChain.data}
                loading={optionChain.loading}
                error={optionChain.error}
                isStale={optionChain.isStale}
                selectedStrike={selectedOption?.strike ?? instrument?.strike_price ?? null}
                selectedType={selectedOption?.optionType ?? (instrument?.option_type as 'CE' | 'PE' | null)}
                onSelectOption={selectOptionFromChain}
                onRetry={optionChain.refetch}
              />
            </div>

            <button
              type="button"
              className={toolkitOpen ? 'range-toolkit-toggle open' : 'range-toolkit-toggle'}
              onClick={() => setToolkitOpen((value) => !value)}
              title={toolkitOpen ? 'Collapse trading toolkit' : 'Open trading toolkit'}
              aria-label={toolkitOpen ? 'Collapse trading toolkit' : 'Open trading toolkit'}
            >
              <span>{toolkitOpen ? '›' : '‹'}</span>
              <strong>Toolkit</strong>
            </button>

            {toolkitOpen ? (
            <form className="range-toolkit" onSubmit={handleSave}>
              <div className="range-panel-section">
              <span className="range-panel-label">Line Tool</span>
              <div className="range-role-grid">
                {(Object.keys(roleLabels) as LineRole[]).map((role) => (
                  <button
                    key={role}
                    type="button"
	                    className={drawing && selectedRole === role ? 'active' : ''}
	                    style={{ '--role-color': roleColors[role] } as React.CSSProperties}
	                    onClick={() => activateLineTool(role)}
	                    disabled={editingLocked}
	                  >
                    {roleLabels[role]}
                  </button>
                ))}
              </div>
            </div>

              <div className="range-panel-section">
              <span className="range-panel-label">Execution</span>
              <div className="range-two">
                <label>
                  <span>Mode</span>
	                  <select value={side} onChange={(event) => setSide(event.target.value as 'BUY' | 'SELL')} disabled={editingLocked}>
	                    <option value="BUY">Buy</option>
	                    <option value="SELL">Sell</option>
	                  </select>
                </label>
                <label>
                  <span>Quantity</span>
	                  <input value={quantity} onChange={(event) => setQuantity(event.target.value.replace(/[^\d]/g, ''))} disabled={editingLocked} />
                </label>
              </div>
              <label>
                <span>Order type</span>
	                <select value={orderType} onChange={(event) => setOrderType(event.target.value as typeof orderType)} disabled={editingLocked}>
	                  <option value="AGGRESSIVE_LIMIT">Aggressive Limit</option>
	                  <option value="MARKET">Market</option>
	                  <option value="LIMIT">Limit</option>
	                </select>
	              </label>
	              {orderType === 'LIMIT' ? (
	                <label>
	                  <span>Limit price</span>
	                  <input value={limitPrice} onChange={(event) => setLimitPrice(event.target.value.replace(/[^\d.]/g, ''))} disabled={editingLocked} />
	                </label>
	              ) : null}
	            </div>

              <div className="range-panel-section">
              <span className="range-panel-label">Trigger Tolerance</span>
              <div className="range-two">
                <label>
                  <span>Value</span>
	                  <input value={toleranceValue} onChange={(event) => setToleranceValue(event.target.value.replace(/[^\d.]/g, ''))} disabled={editingLocked} />
                </label>
                <label>
                  <span>Mode</span>
	                  <select value={toleranceMode} onChange={(event) => setToleranceMode(event.target.value as typeof toleranceMode)} disabled={editingLocked}>
                    <option value="percent">Percent</option>
                    <option value="ticks">Ticks</option>
                    <option value="points">Points</option>
                  </select>
                </label>
              </div>
            </div>

              {selectedLine ? (
                <div className="range-panel-section selected">
                <span className="range-panel-label">Selected Line</span>
	                <label>
	                  <span>Role</span>
		                  <select value={selectedLine.role} onChange={(event) => updateSelectedLine({ role: event.target.value as LineRole, label: roleLabels[event.target.value as LineRole] })} disabled={editingLocked}>
	                    {(Object.keys(roleLabels) as LineRole[]).map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
	                  </select>
	                </label>
	                <label>
	                  <span>Shape</span>
		                  <select value={selectedLine.shape ?? 'level'} onChange={(event) => updateSelectedLine({ shape: event.target.value as LineShape })} disabled={editingLocked}>
	                    <option value="level">Level</option>
	                    <option value="trend">Trend</option>
	                  </select>
	                </label>
	                <label>
                  <span>Trigger</span>
	                  <select value={selectedLine.trigger} onChange={(event) => updateSelectedLine({ trigger: event.target.value as Trigger })} disabled={editingLocked}>
                    <option value="touch">Touch</option>
                    <option value="cross">Cross</option>
                    <option value="close_above">Close Above</option>
                    <option value="close_below">Close Below</option>
                  </select>
                </label>
                <label>
                  <span>Repeat</span>
	                  <select value={selectedLine.repeat_policy} onChange={(event) => updateSelectedLine({ repeat_policy: event.target.value as RepeatPolicy })} disabled={editingLocked}>
                    <option value="once">Only once</option>
                    <option value="every_touch">Every touch</option>
                    <option value="after_reset_distance">After reset distance</option>
                    <option value="after_exit">After SL / Exit</option>
                  </select>
                </label>
                <div className="range-two">
                  <label>
                    <span>Reset distance</span>
	                    <input value={selectedLine.reset_distance ?? ''} onChange={(event) => updateSelectedLine({ reset_distance: event.target.value ? Number(event.target.value) : null })} disabled={editingLocked} />
                  </label>
                  <label>
                    <span>Close buffer</span>
	                    <input value={selectedLine.close_buffer ?? ''} onChange={(event) => updateSelectedLine({ close_buffer: event.target.value ? Number(event.target.value) : null })} disabled={editingLocked} />
                  </label>
                </div>
	                <button type="button" className="range-danger-text" onClick={() => setLines((current) => current.filter((line) => line.id !== selectedLine.id))} disabled={editingLocked}>
                  Delete line
                </button>
                </div>
              ) : null}

              <div className="range-panel-section risk">
              <span className="range-panel-label">Risk / Kill Switch</span>
              <div className="range-pnl-stack">
                <div className="range-pnl-grid">
                  <div><span>Total P&L</span><strong className={pnl.total >= 0 ? 'pos' : 'neg'}>{fmt(pnl.total)}</strong></div>
                  <div><span>Realized</span><strong className={pnl.realized >= 0 ? 'pos' : 'neg'}>{fmt(pnl.realized)}</strong></div>
                  <div><span>Unrealized</span><strong className={pnl.unrealized >= 0 ? 'pos' : 'neg'}>{fmt(pnl.unrealized)}</strong></div>
                </div>
                <div className="range-pnl-summary">
                  <div><span>Entries</span><strong>{pnl.totalEntries}</strong><em>{pnl.openEntries} open / {pnl.closedEntries} closed</em></div>
                  <div><span>Qty</span><strong>{pnl.openQty}</strong><em>{pnl.filledQty} filled / {pnl.closedQty} exited</em></div>
                  <div><span>Avg Entry</span><strong>{fmt(pnl.avgEntryPrice)}</strong><em>LTP {fmt(pnl.lastPrice)}</em></div>
                  <div><span>Waiting</span><strong>{pnl.pendingEntries}</strong><em>{pnl.rejectedEntries} rejected/cancelled</em></div>
                </div>
              </div>
              <label>
                <span>Maximum loss for this tile</span>
	                <input value={maxLoss} onChange={(event) => setMaxLoss(event.target.value.replace(/[^\d.]/g, ''))} placeholder="Optional" disabled={editingLocked} />
              </label>
              <label className="range-check">
	                <input type="checkbox" checked={exitOnMaxLoss} onChange={(event) => setExitOnMaxLoss(event.target.checked)} disabled={editingLocked} />
                <span>Exit all tile entries on max loss breach</span>
              </label>
              <button type="button" className="range-kill" onClick={() => void killSwitch()} disabled={!setupId && !instrument}>Kill Switch</button>
              </div>

              <div className="range-actions">
	              <button type="submit" className="range-secondary" disabled={editingLocked}>Save</button>
	              <button type="button" className="range-secondary" onClick={() => void control('pause')} disabled={!setupId || status !== 'armed'}>Pause to Edit</button>
	              <button type="button" className="range-secondary" onClick={() => void control('stop')} disabled={!setupId}>Stop</button>
	              <button type="button" className="range-start" onClick={handleStart} disabled={!instrument || lines.length === 0 || editingLocked}>
	                {status === 'armed' ? 'Deployed' : executionEnvironment === 'PROD' ? 'Deploy PROD' : 'Deploy UAT'}
              </button>
              </div>

              {message ? <div className="range-msg">{message}</div> : null}
              {runtimeStatus ? <div className={runtimeConnected ? 'range-msg' : 'range-err'}>{runtimeStatus}</div> : null}
              {error ? <div className="range-err">{error}</div> : null}

              <div className={runtimeConnected ? 'range-live-card live' : 'range-live-card'}>
                <div>
                  <span className="range-panel-label">Runtime</span>
                  <strong>{runtimeConnected ? 'LIVE ORDERS MONITORED' : status === 'armed' ? 'ARMED, CONNECTING' : status.toUpperCase()}</strong>
                </div>
                <span>{executionEnvironment} / {instrument?.display_name ?? 'No symbol'}</span>
              </div>

              <div className="range-panel-section">
                <span className="range-panel-label">Live Line Monitor</span>
                <div className="range-line-monitor">
                  {lines.length === 0 ? <span>No lines armed.</span> : null}
                  {lines.map((line) => {
                    const live = lineRuntimeStatuses[line.id]
                    const localLinePrice = live ? null : currentLinePrice(line)
                    return (
                      <div key={line.id} className={live?.trigger_hit ? 'range-line-status hit' : 'range-line-status'}>
                        <div>
                          <strong>{line.label}</strong>
                          <span>{roleLabels[line.role]} / {line.trigger.replace('_', ' ')}</span>
                        </div>
                        <div>
                          <strong>{live ? `${fmt(live.distance)} pts` : 'Waiting'}</strong>
                          <span>
                            {live
                              ? `${fmt(live.ltp)} vs ${fmt(live.line_price)}`
                              : localLinePrice == null ? 'Runtime not reporting yet' : `Line ${fmt(localLinePrice)}`}
                          </span>
                        </div>
                        <p>{live?.decision ?? (runtimeConnected ? 'Waiting for next tick...' : 'Start the setup to monitor this line.')}</p>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="range-panel-section">
              <span className="range-panel-label">Parked Setups</span>
              <div className="range-setup-list">
                {setups.length === 0 ? <span>No parked setups yet.</span> : null}
                {setups.map((setup) => (
                  <button key={setup.id} type="button" onClick={() => applySetup(setup)}>
                    <strong>{setup.display_name}</strong>
                    <span>{setup.status.toUpperCase()} / {setup.timeframe} / {setup.payload.lines.length} lines</span>
                  </button>
                ))}
              </div>
              </div>

              <div className="range-panel-section">
              <span className="range-panel-label">Tile Entries</span>
              <div className="range-entry-list">
                {entries.length === 0 ? <span>No entries from this tile yet.</span> : null}
                {entries.map((entry) => {
                  const entryLine = lines.find((line) => line.id === entry.line_id)
                  const realizedPnl = entryRealizedPnl(entry)
                  const unrealizedPnl = entryUnrealizedPnl(entry, livePrice)
                  const displayPnl = entry.status === 'open' ? unrealizedPnl + realizedPnl : realizedPnl
                  const requestedQty = qtyValue(entry.requested_qty)
                  const filledQty = qtyValue(entry.filled_qty ?? entry.quantity)
                  return (
                    <div key={entry.id} className={`range-entry ${entry.status}`}>
                      <div className="range-entry-main">
                        <strong>{entry.side} {entry.quantity}</strong>
                        <span>{entry.status.toUpperCase()} / {entry.order_status ?? entry.exit_order_status ?? 'PENDING'}</span>
                        <span>{entryLine?.label ?? 'Entry line'} / Qty {filledQty}{requestedQty > 0 ? ` of ${requestedQty}` : ''}</span>
                        {entry.reject_reason ? <span className="range-entry-warning">{entry.reject_reason}</span> : null}
                      </div>
                      <div className="range-entry-price">
                        <strong className={displayPnl >= 0 ? 'pos' : 'neg'}>{fmt(displayPnl)}</strong>
                        <span>Entry {fmt(entry.entry_price)} / Trigger {fmt(entry.trigger_price ?? entry.line_price)}</span>
                        <span>{entry.status === 'closed' ? `Exit ${fmt(entry.exit_price)}` : `LTP ${fmt(livePrice)}`}</span>
                      </div>
                      {entry.order_id || entry.exit_order_id || entry.partial_exits?.length ? (
                        <div className="range-entry-meta">
                          {entry.order_id ? <span>Entry #{entry.order_id}</span> : null}
                          {entry.exit_order_id ? <span>Exit #{entry.exit_order_id}</span> : null}
                          {entry.order_price ? <span>Limit {fmt(entry.order_price)}</span> : null}
                          {entry.partial_exits?.map((partial, index) => (
                            <span key={`${entry.id}-px-${index}`}>Partial {partial.exit_filled_qty ?? 0} @ {fmt(partial.exit_price)} / P&L {fmt(partial.pnl ?? 0)}</span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
              </div>

              <div className="range-panel-section">
              <span className="range-panel-label">Event Stream</span>
              <div className="range-event-list">
                {events.length === 0 ? <span>No range events yet.</span> : null}
                {events.map((event) => (
                  <div key={event.id} className={`range-event ${event.level}`}>
                    <strong>{event.event_type.replace(/_/g, ' ')}</strong>
                    <span>{event.message}</span>
                  </div>
                ))}
              </div>
              </div>
            </form>
            ) : null}
          </aside>
          ) : null}
        </section>
      </main>

      {prodDisclaimer ? (
        <div className="range-modal-backdrop">
          <div className="range-modal">
            <span className="range-panel-label">PROD Execution Disclaimer</span>
            <h2>Live orders can be fired from this setup.</h2>
            <p>
              You are arming Range Trader on PROD. After this, line triggers can place live Nubra
              orders without per-entry confirmation. Keep the kill switch visible and monitor positions.
            </p>
            <div className="range-modal-actions">
              <button type="button" className="range-secondary" onClick={() => setProdDisclaimer(false)}>Cancel</button>
              <button type="button" className="range-start" onClick={() => { setProdDisclaimer(false); void control('arm') }}>Accept and Start</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
