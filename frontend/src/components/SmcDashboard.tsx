import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createChart,
  ColorType,
  LineStyle,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type IPriceLine,
} from 'lightweight-charts'
import './smc-dashboard.css'

// ── Types ──────────────────────────────────────────────────────────────────────

interface SmcZone {
  zone_type: 'BULL_OB' | 'BEAR_OB' | 'BULL_FVG' | 'BEAR_FVG' | 'BSL' | 'SSL'
  high: number; low: number; strength: number; status: string; candle_time: string
}
interface SmcMtfLevel {
  timeframe: string; interval: string; trend: string; last_signal: string
  signal_label: string; price_zone: string; note: string
  confluence_score: number; bos_level: number | null
}
interface SmcSignal {
  symbol: string; signal: string; signal_label: string
  timeframe: string; price: number; strength: number; timestamp: string
}
interface SmcCandle { t: string; o: number; h: number; l: number; c: number; v: number }
interface SmcSnapshot {
  status: string; symbol: string; exchange: string; interval: string; interval_label: string
  current_price: number; structure_trend: string; confluence_score: number; price_zone: string
  bos_level: number | null; choch_level: number | null; last_signal: string; last_signal_label: string
  signal_bars_ago: number | null
  zones: SmcZone[]; mtf: SmcMtfLevel[]; recent_signals: SmcSignal[]; candles: SmcCandle[]
  fetched_at: string
}
interface Session { access_token: string; device_id: string; environment: string; user_name?: string; is_demo?: boolean }
interface SmcDashboardProps { session: Session; onBack: () => void; renderNav: (activeTab: string) => React.ReactNode }

// ── Constants ──────────────────────────────────────────────────────────────────

const SYMBOLS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY']
const INTERVALS = [
  { value: '1', label: '1m' }, { value: '3', label: '3m' }, { value: '5', label: '5m' },
  { value: '15', label: '15m' }, { value: '60', label: '1H' },
]
const SIGNAL_FILTERS = ['BOS_UP', 'BOS_DOWN', 'CHOCH_UP', 'CHOCH_DOWN', 'SWEEP_UP', 'SWEEP_DOWN', 'OB_TEST', 'FVG_ENTRY'] as const
type SignalFilter = typeof SIGNAL_FILTERS[number]

const SIGNAL_LABELS: Record<string, string> = {
  BOS_UP: 'BOS ↑', BOS_DOWN: 'BOS ↓', CHOCH_UP: 'CHoCH ↑', CHOCH_DOWN: 'CHoCH ↓',
  SWEEP_UP: 'Sweep ↑', SWEEP_DOWN: 'Sweep ↓', OB_TEST: 'OB Test', FVG_ENTRY: 'FVG',
}
const ZONE_COLORS: Record<string, { bg: string; border: string; text: string; line: string }> = {
  BULL_OB:  { bg: 'rgba(232,160,32,.12)',  border: 'rgba(232,160,32,.35)',  text: '#E8A020', line: '#E8A020' },
  BEAR_OB:  { bg: 'rgba(240,96,122,.12)',  border: 'rgba(240,96,122,.35)',  text: '#F0607A', line: '#F0607A' },
  BULL_FVG: { bg: 'rgba(91,156,246,.12)',  border: 'rgba(91,156,246,.35)',  text: '#5B9CF6', line: '#5B9CF6' },
  BEAR_FVG: { bg: 'rgba(240,96,122,.10)',  border: 'rgba(240,96,122,.28)',  text: '#F0607A', line: '#F0607A' },
  BSL:      { bg: 'rgba(167,139,250,.12)', border: 'rgba(167,139,250,.35)', text: '#A78BFA', line: '#A78BFA' },
  SSL:      { bg: 'rgba(167,139,250,.10)', border: 'rgba(167,139,250,.28)', text: '#A78BFA', line: '#A78BFA' },
}
const ZONE_LABELS: Record<string, string> = {
  BULL_OB: 'Bull OB', BEAR_OB: 'Bear OB', BULL_FVG: 'Bull FVG', BEAR_FVG: 'Bear FVG', BSL: 'BSL Pool', SSL: 'SSL Pool',
}
const TREND_COLOR: Record<string, string> = { BULLISH: '#26C9A8', BEARISH: '#F0607A', RANGING: '#8A96B8' }
const SIG_CLASS: Record<string, string> = {
  BOS_UP: 'sig-bos-up', BOS_DOWN: 'sig-bos-dn', CHOCH_UP: 'sig-choch-up', CHOCH_DOWN: 'sig-choch-dn',
  SWEEP_UP: 'sig-bos-up', SWEEP_DOWN: 'sig-bos-dn', OB_TEST: 'sig-ob', FVG_ENTRY: 'sig-fvg', NONE: 'sig-none',
}

// IST = UTC+5:30 = +19800s. Backend sends timestamps in IST without tz info.
// We treat them as UTC then add the IST offset so lightweight-charts displays
// the correct IST wall-clock time (09:15 instead of 03:45).
const IST_OFFSET = 19800

function toTs(t: string): UTCTimestamp {
  const s = t.endsWith('Z') || t.includes('+') ? t : t + 'Z'
  return (Math.floor(new Date(s).getTime() / 1000) + IST_OFFSET) as UTCTimestamp
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function SmcDashboard({ session, onBack: _onBack, renderNav }: SmcDashboardProps) {
  const [symbol, setSymbol] = useState('NIFTY')
  const [tf, setTf] = useState('5')
  const [snapshot, setSnapshot] = useState<SmcSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanSignals, setScanSignals] = useState<SmcSignal[]>([])
  const [activeFilters, setActiveFilters] = useState<Set<SignalFilter>>(
    new Set(['BOS_UP', 'BOS_DOWN', 'CHOCH_UP', 'CHOCH_DOWN', 'SWEEP_UP', 'SWEEP_DOWN'])
  )

  // ── Today-only mode ─────────────────────────────────────────────────────────
  const [todayOnly, setTodayOnly] = useState(true)

  // ── Column resize ────────────────────────────────────────────────────────────
  const [leftWidth, setLeftWidth] = useState(212)
  const [rightWidth, setRightWidth] = useState(250)

  function startResize(side: 'left' | 'right') {
    return (e: React.MouseEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startW = side === 'left' ? leftWidth : rightWidth
      const set = side === 'left' ? setLeftWidth : setRightWidth
      const sign = side === 'left' ? 1 : -1
      const onMove = (me: MouseEvent) => {
        set(Math.max(140, Math.min(480, startW + sign * (me.clientX - startX))))
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    }
  }

  // ── Live price via ws/oie ────────────────────────────────────────────────────
  const [livePrice, setLivePrice] = useState<number | null>(null)
  const [wsConnected, setWsConnected] = useState(false)
  const displayPrice = livePrice ?? snapshot?.current_price ?? null
  const wsRef = useRef<WebSocket | null>(null)
  const symbolRef = useRef(symbol)
  symbolRef.current = symbol

  // Single WebSocket connection — stays open, switches underlying on symbol change
  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/oie`)
    wsRef.current = ws

    ws.onopen = () => {
      setWsConnected(true)
      ws.send(JSON.stringify({
        session_token: session.access_token,
        device_id: session.device_id,
        environment: session.environment,
        underlying: symbolRef.current,
        expiry: null,
        interval_seconds: 15,
      }))
    }

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string)
        if (msg.type === 'data') {
          const price = msg.chain?.spot_price ?? msg.intelligence?.spot_price
          if (price) setLivePrice(Number(price))
        }
      } catch { /* ignore parse errors */ }
    }

    ws.onclose = () => { setWsConnected(false); wsRef.current = null }
    ws.onerror = () => { setWsConnected(false) }

    return () => { ws.close(); wsRef.current = null }
  }, [session]) // eslint-disable-line react-hooks/exhaustive-deps

  // Send switch command when symbol changes (no reconnect needed)
  useEffect(() => {
    setLivePrice(null)
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ cmd: 'switch', underlying: symbol, expiry: null, interval_seconds: 15 }))
    }
  }, [symbol])

  // ── Chart refs ───────────────────────────────────────────────────────────────
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const bosLineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const chochLineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const zoneLineSeriesRef = useRef<ISeriesApi<'Line'>[]>([])
  const priceLinesRef = useRef<IPriceLine[]>([])
  const livePriceLineRef = useRef<IPriceLine | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // ── Create chart once on mount ───────────────────────────────────────────────
  useEffect(() => {
    if (!chartContainerRef.current) return

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#141927' },
        textColor: '#8A96B8',
        fontFamily: "'JetBrains Mono', 'SF Mono', ui-monospace, monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(26,36,64,.8)' },
        horzLines: { color: 'rgba(26,36,64,.8)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(255,255,255,0.2)', labelBackgroundColor: '#1C2235' },
        horzLine: { color: 'rgba(255,255,255,0.2)', labelBackgroundColor: '#1C2235' },
      },
      rightPriceScale: {
        borderColor: '#1A2440',
        textColor: '#8A96B8',
      },
      timeScale: {
        borderColor: '#1A2440',
        timeVisible: true,
        secondsVisible: false,
        fixLeftEdge: false,
        fixRightEdge: false,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
    })

    // Candlestick series
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#26C9A8',
      downColor: '#F0607A',
      borderUpColor: '#26C9A8',
      borderDownColor: '#F0607A',
      wickUpColor: '#26C9A8',
      wickDownColor: '#F0607A',
    })

    // Volume histogram on separate scale
    const volSeries = chart.addHistogramSeries({
      color: '#5A6488',
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
    })
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } })

    chartRef.current = chart
    candleSeriesRef.current = candleSeries
    volSeriesRef.current = volSeries

    // Responsive resize
    const ro = new ResizeObserver(() => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        })
      }
    })
    ro.observe(chartContainerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      candleSeriesRef.current = null
      volSeriesRef.current = null
      bosLineSeriesRef.current = null
      chochLineSeriesRef.current = null
      zoneLineSeriesRef.current = []
    }
  }, [])

  // ── Update chart data when snapshot changes ──────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current
    const candleSeries = candleSeriesRef.current
    const volSeries = volSeriesRef.current
    if (!chart || !candleSeries || !volSeries || !snapshot) return

    // Remove old price lines
    priceLinesRef.current.forEach(pl => { try { candleSeries.removePriceLine(pl) } catch { /* ignore */ } })
    priceLinesRef.current = []

    // Deduplicate + sort candles by timestamp
    const seen = new Set<number>()
    const candleData = snapshot.candles
      .map(c => ({ time: toTs(c.t), open: c.o, high: c.h, low: c.l, close: c.c }))
      .filter(c => { if (seen.has(c.time)) return false; seen.add(c.time); return true })
      .sort((a, b) => a.time - b.time)

    const volSeen = new Set<number>()
    const volData = snapshot.candles
      .map(c => ({ time: toTs(c.t), value: c.v, color: c.c >= c.o ? 'rgba(38,201,168,.22)' : 'rgba(240,96,122,.18)' }))
      .filter(c => { if (volSeen.has(c.time)) return false; volSeen.add(c.time); return true })
      .sort((a, b) => a.time - b.time)

    candleSeries.setData(candleData)
    volSeries.setData(volData)

    const newLines: IPriceLine[] = []

    // Remove stale bounded signal line series
    if (bosLineSeriesRef.current) { try { chart.removeSeries(bosLineSeriesRef.current) } catch { /**/ } bosLineSeriesRef.current = null }
    if (chochLineSeriesRef.current) { try { chart.removeSeries(chochLineSeriesRef.current) } catch { /**/ } chochLineSeriesRef.current = null }

    // Compute signal bar timestamp from candle list + bars_ago
    const sortedCandles = candleData  // already deduplicated + sorted by time
    const lastTs = sortedCandles.length > 0 ? sortedCandles[sortedCandles.length - 1].time : null
    const barsAgoVal = snapshot.signal_bars_ago ?? 0
    const sigIdx = Math.max(0, sortedCandles.length - 1 - barsAgoVal)
    const signalTs = sortedCandles[sigIdx]?.time ?? null

    const markers: { time: UTCTimestamp; position: 'aboveBar' | 'belowBar'; color: string; shape: 'arrowUp' | 'arrowDown'; text: string; size: number }[] = []

    const sig = snapshot.last_signal
    const isUp = sig === 'BOS_UP' || sig === 'CHOCH_UP' || sig === 'SWEEP_UP'
    const sigLineColor = sig.startsWith('CHOCH') ? '#A78BFA' : sig.startsWith('SWEEP') ? '#E8A020' : '#26C9A8'
    const sigLabel = sig.startsWith('BOS') ? `BOS ${isUp ? '↑' : '↓'}` : sig.startsWith('CHOCH') ? `CHoCH ${isUp ? '↑' : '↓'}` : `Sweep ${isUp ? '↑' : '↓'}`

    // BOS / CHoCH / SWEEP — bounded line from signal bar to last bar
    if (snapshot.bos_level && signalTs && lastTs && signalTs <= lastTs) {
      const s = chart.addLineSeries({
        color: sigLineColor,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        lastValueVisible: true,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      })
      s.setData([{ time: signalTs, value: snapshot.bos_level }, { time: lastTs, value: snapshot.bos_level }])
      bosLineSeriesRef.current = s
      markers.push({ time: signalTs, position: isUp ? 'aboveBar' : 'belowBar', color: sigLineColor, shape: isUp ? 'arrowUp' : 'arrowDown', text: sigLabel, size: 1 })
    }

    // CHoCH — additional line (only when distinct from bos_level)
    if (snapshot.choch_level && snapshot.choch_level !== snapshot.bos_level && signalTs && lastTs && signalTs <= lastTs) {
      const s = chart.addLineSeries({
        color: '#A78BFA',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        lastValueVisible: true,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      })
      s.setData([{ time: signalTs, value: snapshot.choch_level }, { time: lastTs, value: snapshot.choch_level }])
      chochLineSeriesRef.current = s
    }

    if (markers.length > 0) candleSeries.setMarkers(markers)

    // Zone lines — bounded from the candle where the zone formed to the last candle
    // Remove stale zone line series first
    zoneLineSeriesRef.current.forEach(s => { try { chart.removeSeries(s) } catch { /**/ } })
    zoneLineSeriesRef.current = []

    const currentMid = snapshot.current_price
    const sortedZones = [...snapshot.zones].sort(
      (a, b) => Math.abs((a.high + a.low) / 2 - currentMid) - Math.abs((b.high + b.low) / 2 - currentMid)
    )
    for (const z of sortedZones.slice(0, 6)) {
      const col = ZONE_COLORS[z.zone_type]?.line ?? '#8A96B8'
      const isFvg = z.zone_type.includes('FVG')
      const isBull = z.zone_type.startsWith('BULL') || z.zone_type === 'BSL'
      const typeTag = isFvg ? (isBull ? 'FVG↑' : 'FVG↓') : z.zone_type === 'BSL' ? 'BSL' : z.zone_type === 'SSL' ? 'SSL' : (isBull ? 'OB↑' : 'OB↓')

      const zoneStartTs = z.candle_time ? toTs(z.candle_time) : null

      if (zoneStartTs && lastTs && zoneStartTs <= lastTs) {
        // High boundary — bounded line series with axis label
        const sh = chart.addLineSeries({
          color: col,
          lineWidth: 1,
          lineStyle: isFvg ? LineStyle.Dotted : LineStyle.Dashed,
          lastValueVisible: true,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          title: typeTag,
        })
        sh.setData([{ time: zoneStartTs, value: z.high }, { time: lastTs, value: z.high }])
        zoneLineSeriesRef.current.push(sh)

        // Low boundary — no label
        const sl = chart.addLineSeries({
          color: col + '88',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
        })
        sl.setData([{ time: zoneStartTs, value: z.low }, { time: lastTs, value: z.low }])
        zoneLineSeriesRef.current.push(sl)
      } else {
        // Fallback if no candle_time: infinite price line
        newLines.push(candleSeries.createPriceLine({
          price: z.high, color: col, lineWidth: 1,
          lineStyle: isFvg ? LineStyle.Dotted : LineStyle.Dashed,
          axisLabelVisible: true, title: typeTag,
        }))
        newLines.push(candleSeries.createPriceLine({
          price: z.low, color: col + '88', lineWidth: 1,
          lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: '',
        }))
      }
    }

    // Live price line — managed separately via livePriceLineRef so WS ticks
    // can update it cheaply without recreating zone lines
    if (livePriceLineRef.current) {
      try { candleSeries.removePriceLine(livePriceLineRef.current) } catch { /* ignore */ }
    }
    const initPrice = snapshot.current_price
    livePriceLineRef.current = candleSeries.createPriceLine({
      price: initPrice,
      color: '#DCE2EE',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: '▶',
    })

    priceLinesRef.current = newLines
    // todayOnly range is applied by the separate effect below; only fitContent when off
    if (!todayOnly) chart.timeScale().fitContent()
  }, [snapshot]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update just the live price line on every WebSocket tick — no zone redraw
  useEffect(() => {
    const pl = livePriceLineRef.current
    if (!pl || displayPrice === null) return
    try { pl.applyOptions({ price: displayPrice }) } catch { /* series removed */ }
  }, [displayPrice])

  // Adjust chart visible range when todayOnly toggles — only after data loads
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !snapshot) return
    if (todayOnly) {
      const istDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
      try {
        chart.timeScale().setVisibleRange({
          from: toTs(`${istDate}T09:14:00`) as UTCTimestamp,
          to:   toTs(`${istDate}T15:31:00`) as UTCTimestamp,
        })
      } catch { /* chart may have no data yet */ }
    } else {
      chart.timeScale().fitContent()
    }
  }, [todayOnly, snapshot])

  // ── Fetch snapshot ───────────────────────────────────────────────────────────
  const fetchSnapshot = useCallback(async (sym: string, interval: string) => {
    if (abortRef.current) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/smc/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_token: session.access_token,
          device_id: session.device_id,
          environment: session.environment,
          symbol: sym, exchange: 'NSE', interval,
        }),
        signal: ctrl.signal,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.detail ?? data?.message ?? `HTTP ${res.status}`)
      setSnapshot(data as SmcSnapshot)
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return
      setError(e instanceof Error ? e.message : 'Failed to load SMC data')
    } finally {
      setLoading(false)
    }
  }, [session])

  // ── Fetch scan ───────────────────────────────────────────────────────────────
  const fetchScan = useCallback(async (interval: string) => {
    try {
      const res = await fetch('/api/smc/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_token: session.access_token,
          device_id: session.device_id,
          environment: session.environment,
          symbols: SYMBOLS, exchange: 'NSE', interval,
        }),
      })
      const data = await res.json()
      if (res.ok && data.signals) setScanSignals(data.signals as SmcSignal[])
    } catch { /* silent */ }
  }, [session])

  // Initial load + 30s auto-refresh for SMC analysis
  useEffect(() => {
    void fetchSnapshot(symbol, tf)
    void fetchScan(tf)
    const timer = window.setInterval(() => {
      void fetchSnapshot(symbol, tf)
      void fetchScan(tf)
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [symbol, tf, fetchSnapshot, fetchScan])

  // ── Derived ──────────────────────────────────────────────────────────────────
  const zones = snapshot?.zones ?? []
  const obsZones = zones.filter(z => z.zone_type.includes('OB'))
  const fvgZones = zones.filter(z => z.zone_type.includes('FVG'))
  const liqZones = zones.filter(z => z.zone_type === 'BSL' || z.zone_type === 'SSL')

  const allSignals: SmcSignal[] = [
    ...(snapshot?.recent_signals ?? []), ...scanSignals,
  ].filter((s, i, arr) =>
    arr.findIndex(x => x.symbol === s.symbol && x.signal === s.signal && x.timeframe === s.timeframe) === i
  )

  const todayISTDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

  const filteredSignals = allSignals.filter(s => {
    if (activeFilters.size > 0 && !activeFilters.has(s.signal as SignalFilter)) return false
    if (todayOnly && !s.timestamp.startsWith(todayISTDate)) return false
    return true
  })

  const trendColor = TREND_COLOR[snapshot?.structure_trend ?? 'RANGING'] ?? '#8A96B8'
  const confScore = snapshot?.confluence_score ?? 0

  // Signal age helpers
  const TF_MINUTES: Record<string, number> = { '1': 1, '3': 3, '5': 5, '15': 15, '60': 60 }
  const sigBarsAgo = snapshot?.signal_bars_ago ?? null
  const sigMinAgo = sigBarsAgo != null ? sigBarsAgo * (TF_MINUTES[tf] ?? 5) : null
  const sigAgeLabel = sigMinAgo == null ? null : sigMinAgo < 60 ? `${sigMinAgo}m ago` : `${Math.round(sigMinAgo / 60)}h ago`
  const sigFresh = sigBarsAgo != null && sigBarsAgo <= 5
  const sigStale = sigBarsAgo != null && sigBarsAgo > 20
  const sigColor = snapshot?.last_signal?.includes('UP') ? '#26C9A8' : '#F0607A'
  const sigDelta = snapshot?.signal_price != null && displayPrice != null
    ? Math.round(displayPrice - snapshot.signal_price) : null

  function toggleFilter(f: SignalFilter) {
    setActiveFilters(prev => { const n = new Set(prev); n.has(f) ? n.delete(f) : n.add(f); return n })
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="smc-shell">
      {renderNav('SMC Dashboard')}

      {/* Metric bar */}
      <div className="smc-metric-bar">
        <div className="smc-metric-card">
          <div className="smc-metric-label">Structure</div>
          <div className="smc-metric-val" style={{ color: trendColor, fontSize: 13 }}>
            {loading ? '…' : (snapshot?.structure_trend ?? '—')}
          </div>
          <div className="smc-metric-sub">{snapshot?.last_signal_label ?? '—'}</div>
        </div>
        <div className="smc-metric-card">
          <div className="smc-metric-label">Order Blocks</div>
          <div className="smc-metric-val" style={{ color: '#E8A020' }}>{obsZones.length}</div>
          <div className="smc-metric-sub">{obsZones.filter(z => z.zone_type === 'BULL_OB').length} bull · {obsZones.filter(z => z.zone_type === 'BEAR_OB').length} bear</div>
        </div>
        <div className="smc-metric-card">
          <div className="smc-metric-label">Fair Value Gaps</div>
          <div className="smc-metric-val" style={{ color: '#5B9CF6' }}>{fvgZones.length}</div>
          <div className="smc-metric-sub">{fvgZones.filter(z => z.status === 'UNFILLED').length} unfilled</div>
        </div>
        <div className="smc-metric-card">
          <div className="smc-metric-label">Liq. Pools</div>
          <div className="smc-metric-val" style={{ color: '#A78BFA' }}>{liqZones.length}</div>
          <div className="smc-metric-sub">BSL · SSL unswept</div>
        </div>
        <div className="smc-metric-card" style={{ minWidth: 130 }}>
          <div className="smc-metric-label">Confluence</div>
          <div className="smc-metric-val" style={{ color: confScore >= 65 ? '#26C9A8' : confScore >= 45 ? '#E8A020' : '#F0607A' }}>
            {confScore}<span style={{ fontSize: 11, color: '#5A6488' }}>/100</span>
          </div>
          <div style={{ width: '100%', height: 3, background: '#1C2235', borderRadius: 2, marginTop: 4 }}>
            <div style={{ width: `${confScore}%`, height: 3, background: confScore >= 65 ? '#26C9A8' : confScore >= 45 ? '#E8A020' : '#F0607A', borderRadius: 2 }} />
          </div>
        </div>
        <div className="smc-metric-card" style={{ flex: 1 }}>
          <div className="smc-metric-label">Last Signal</div>
          {loading
            ? <span style={{ color: '#5A6488', fontFamily: 'monospace', fontSize: 11, marginTop: 3, display: 'block' }}>Loading…</span>
            : snapshot?.last_signal && snapshot.last_signal !== 'NONE' && snapshot.signal_price != null
              ? <div style={{ marginTop: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: sigColor }}>
                      {snapshot.last_signal_label}
                    </span>
                    {sigAgeLabel && (
                      <span style={{
                        fontFamily: 'monospace', fontSize: 9, padding: '1px 5px', borderRadius: 3,
                        color: sigFresh ? '#26C9A8' : sigStale ? '#5A6488' : '#E8A020',
                        background: sigFresh ? 'rgba(38,201,168,.1)' : sigStale ? 'rgba(90,100,136,.1)' : 'rgba(232,160,32,.1)',
                        border: `1px solid ${sigFresh ? 'rgba(38,201,168,.3)' : sigStale ? 'rgba(90,100,136,.25)' : 'rgba(232,160,32,.3)'}`,
                      }}>
                        {sigFresh ? 'FRESH' : sigStale ? `STALE · ${sigAgeLabel}` : sigAgeLabel}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 3 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#8A96B8' }}>
                      {snapshot.last_signal.startsWith('SWEEP') ? 'swept' : 'broke'} {snapshot.signal_price.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                    </span>
                    {sigDelta != null && (
                      <span style={{ fontFamily: 'monospace', fontSize: 10, color: sigDelta > 0 ? '#26C9A8' : '#F0607A' }}>
                        {sigDelta > 0 ? '+' : ''}{sigDelta} pts now
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#5A6488', marginTop: 2 }}>
                    {INTERVALS.find(x => x.value === tf)?.label} · {snapshot.price_zone}
                  </div>
                </div>
              : <span style={{ color: '#5A6488', fontFamily: 'monospace', fontSize: 11, marginTop: 3, display: 'block' }}>No recent signal</span>
          }
        </div>
      </div>

      {/* Body */}
      <div className="smc-body">

        {/* Left sidebar */}
        <div className="smc-sidebar" style={{ flex: `0 0 ${leftWidth}px` }}>
          <div className="smc-panel-title">Zone Map</div>
          {loading && zones.length === 0 && (
            <div style={{ padding: '20px 12px', textAlign: 'center', color: '#5A6488', fontFamily: 'monospace', fontSize: 11 }}>Computing zones…</div>
          )}
          {error && (
            <div style={{ padding: '12px', color: '#F0607A', fontSize: 11 }}>
              {error}
              <button className="smc-ghost-btn" style={{ marginTop: 6 }} onClick={() => fetchSnapshot(symbol, tf)}>Retry</button>
            </div>
          )}
          {zones.length === 0 && !loading && !error && (
            <div style={{ padding: '20px 12px', textAlign: 'center', color: '#5A6488', fontFamily: 'monospace', fontSize: 11 }}>No active zones</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px' }}>
            {zones.slice(0, 8).map((z, i) => {
              const col = ZONE_COLORS[z.zone_type]
              return (
                <div key={i} className="smc-zone-card" style={{ background: col.bg, borderColor: col.border }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                    <span className="smc-zone-type-label" style={{ color: col.text }}>{ZONE_LABELS[z.zone_type]}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 9, color: col.text, background: col.bg, padding: '1px 5px', borderRadius: 2, border: `1px solid ${col.border}` }}>{z.status}</span>
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#D8DFEE' }}>
                    {z.high.toLocaleString(undefined, { maximumFractionDigits: 1 })} – {z.low.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <span style={{ fontSize: 10, color: '#8A96B8' }}>Str {z.strength.toFixed(0)}%</span>
                    <div style={{ flex: 1, height: 3, background: '#1C2235', borderRadius: 2 }}>
                      <div style={{ width: `${z.strength}%`, height: 3, background: col.text, borderRadius: 2 }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <div className="smc-resize-handle" onMouseDown={startResize('left')} />

        {/* Center */}
        <div className="smc-center">
          {/* Instrument + TF bar */}
          <div className="smc-subhdr">
            <div style={{ display: 'flex', gap: 4 }}>
              {SYMBOLS.map(sym => (
                <button
                  key={sym}
                  className={sym === symbol ? 'smc-sym-pill smc-sym-pill-active' : 'smc-sym-pill'}
                  onClick={() => { setSymbol(sym); setSnapshot(null) }}
                >{sym}</button>
              ))}
            </div>
            {displayPrice !== null && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, margin: '0 8px' }}>
                <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700 }}>
                  {displayPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
                {wsConnected
                  ? <span title="Live via WebSocket" style={{ fontFamily: 'monospace', fontSize: 9, color: '#26C9A8', background: 'rgba(38,201,168,.1)', border: '1px solid rgba(38,201,168,.3)', borderRadius: 3, padding: '1px 5px' }}>LIVE</span>
                  : <span title="Polling (30s)" style={{ fontFamily: 'monospace', fontSize: 9, color: '#5A6488', background: 'rgba(90,100,136,.1)', border: '1px solid rgba(90,100,136,.25)', borderRadius: 3, padding: '1px 5px' }}>30s</span>
                }
              </span>
            )}
            <div style={{ display: 'flex', gap: 3 }}>
              {INTERVALS.map(({ value, label }) => (
                <button
                  key={value}
                  className={value === tf ? 'smc-tf-pill smc-tf-pill-active' : 'smc-tf-pill'}
                  onClick={() => { setTf(value); setSnapshot(null) }}
                >{label}</button>
              ))}
            </div>
            {/* Fit-to-content button */}
            <button
              className="smc-ghost-btn"
              style={{ marginLeft: 8 }}
              title="Fit chart to data"
              onClick={() => chartRef.current?.timeScale().fitContent()}
            >⤢</button>
            {/* Today-only toggle */}
            <button
              className={todayOnly ? 'smc-today-btn smc-today-btn-on' : 'smc-today-btn'}
              title={todayOnly ? 'Showing today only — click for full history' : 'Showing full history — click for today only'}
              onClick={() => setTodayOnly(v => !v)}
            >TODAY</button>
            {snapshot && (
              <div className="smc-str-badge" style={{ marginLeft: 'auto', color: trendColor }}>
                <div className="smc-str-dot" style={{ background: trendColor }} />
                {snapshot.structure_trend}
              </div>
            )}
          </div>

          {/* lightweight-charts container */}
          <div className="smc-chart-area">
            <div className="smc-chart-wrap" style={{ position: 'relative' }}>
              <div
                ref={chartContainerRef}
                style={{ width: '100%', height: '100%' }}
              />
              {/* chart label overlay */}
              <div className="smc-chart-label" style={{ pointerEvents: 'none' }}>
                {symbol} · {INTERVALS.find(x => x.value === tf)?.label ?? tf} · SMC
              </div>
              {/* hint overlay */}
              {!snapshot && !loading && !error && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#5A6488' }}>Select an instrument above</span>
                </div>
              )}
              {loading && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(20,25,39,0.65)', pointerEvents: 'none' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#8A96B8' }}>Loading chart…</span>
                </div>
              )}
              {/* legend */}
              {snapshot && (
                <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6, pointerEvents: 'none' }}>
                  {snapshot.bos_level && (
                    <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#26C9A8', background: 'rgba(38,201,168,.1)', border: '1px solid rgba(38,201,168,.3)', borderRadius: 3, padding: '2px 6px' }}>BOS {Math.round(snapshot.bos_level).toLocaleString()}</span>
                  )}
                  {snapshot.choch_level && (
                    <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#A78BFA', background: 'rgba(167,139,250,.1)', border: '1px solid rgba(167,139,250,.3)', borderRadius: 3, padding: '2px 6px' }}>CHoCH {Math.round(snapshot.choch_level).toLocaleString()}</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* MTF strip */}
          <div className="smc-mtf-strip">
            <div className="smc-panel-title" style={{ borderBottom: '1px solid #1A2440' }}>Multi-Timeframe Structure</div>
            <div style={{ overflowX: 'auto' }}>
              <table className="smc-mtf-table">
                <thead><tr><th>TF</th><th>Trend</th><th>Signal</th><th>Zone</th><th>Key Level</th><th>Note</th></tr></thead>
                <tbody>
                  {snapshot?.mtf.map((m, i) => (
                    <tr key={i}>
                      <td style={{ color: '#E8A020', fontWeight: 700 }}>{m.timeframe}</td>
                      <td style={{ color: TREND_COLOR[m.trend] ?? '#8A96B8' }}>{m.trend}</td>
                      <td><span className={`smc-sig ${SIG_CLASS[m.last_signal] ?? 'sig-none'}`}>{m.signal_label}</span></td>
                      <td><span className={`smc-zone-badge smc-zone-${m.price_zone.toLowerCase()}`}>{m.price_zone}</span></td>
                      <td style={{ fontFamily: 'monospace', color: '#D8DFEE' }}>{m.bos_level ? m.bos_level.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—'}</td>
                      <td style={{ color: '#8A96B8' }}>{m.note}</td>
                    </tr>
                  ))}
                  {(!snapshot || !snapshot.mtf.length) && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: '#5A6488', padding: '12px 0' }}>{loading ? 'Loading MTF…' : 'No MTF data'}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="smc-resize-handle" onMouseDown={startResize('right')} />

        {/* Right scanner */}
        <div className="smc-scanner" style={{ flex: `0 0 ${rightWidth}px` }}>
          <div className="smc-panel-title" style={{ borderBottom: '1px solid #1A2440' }}>
            <span>SMC Scanner</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div className="smc-live-dot" />
              <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#26C9A8' }}>LIVE</span>
            </div>
          </div>
          <div className="smc-filter-bar">
            {(['BOS_UP', 'BOS_DOWN', 'CHOCH_UP', 'CHOCH_DOWN'] as SignalFilter[]).map(f => (
              <button
                key={f}
                className={`smc-filter-pill ${activeFilters.has(f) ? 'on' : ''} fp-${f.toLowerCase().replace(/_/g, '-')}`}
                onClick={() => toggleFilter(f)}
              >{SIGNAL_LABELS[f]}</button>
            ))}
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filteredSignals.length === 0 && (
              <div style={{ padding: '20px 12px', textAlign: 'center', color: '#5A6488', fontFamily: 'monospace', fontSize: 11 }}>
                {loading ? 'Scanning…' : 'No signals match filters'}
              </div>
            )}
            {filteredSignals.map((s, i) => {
              const isBull = s.signal.endsWith('UP')
              const barColor = isBull ? '#26C9A8' : s.signal.includes('CHOCH') ? '#A78BFA' : s.signal.includes('OB') ? '#E8A020' : '#5B9CF6'
              return (
                <div key={i} className="smc-scan-row">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{s.symbol}</span>
                    <span className={`smc-sig ${SIG_CLASS[s.signal] ?? 'sig-none'}`}>{s.signal_label}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#5A6488' }}>{s.timeframe}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#8A96B8', flex: 1 }}>
                      {s.price.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                    </span>
                    <div style={{ flex: 2, height: 4, background: '#1C2235', borderRadius: 2 }}>
                      <div style={{ width: `${s.strength}%`, height: 4, background: barColor, borderRadius: 2 }} />
                    </div>
                    <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#5A6488', width: 28, textAlign: 'right' }}>
                      {s.strength.toFixed(0)}%
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ borderTop: '1px solid #1A2440', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#5A6488' }}>
              {allSignals.length} signal{allSignals.length !== 1 ? 's' : ''} · 30s refresh
            </span>
            <button className="smc-ghost-btn" onClick={() => { void fetchSnapshot(symbol, tf); void fetchScan(tf) }}>Refresh</button>
          </div>
        </div>

      </div>
    </div>
  )
}
