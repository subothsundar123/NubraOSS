import ScalperLiveChart from '../ScalperLiveChart'
import type { DrawerCandle } from '../../positioning/useInstrumentContext'
import type { OptionChainData } from '../../positioning/useOptionChain'
import type { ComputedOverlay } from '../../types/indicators'

interface OIWallChartProps {
  candles: DrawerCandle[]
  loading: boolean
  latestPrice: number | null
  optionChain: OptionChainData | null
  isStale?: boolean
  sessionDate?: string | null
  fetchError?: string | null
}

const OI_WALL_THRESHOLD = 0.6   // strike must have at least 60% of max OI to count as a wall
const MAX_WALLS = 8              // cap lines for readability

function buildOIWallOverlays(chain: OptionChainData | null, candles: DrawerCandle[]): ComputedOverlay[] {
  if (!chain || !candles.length) return []

  const maxCE = Math.max(...chain.strikes.map((r) => r.ce_oi ?? 0), 0)
  const maxPE = Math.max(...chain.strikes.map((r) => r.pe_oi ?? 0), 0)

  if (!maxCE && !maxPE) return []

  const firstTs = Math.floor(candles[0].epoch_ms / 1000)
  const lastTs = Math.floor(candles[candles.length - 1].epoch_ms / 1000)

  const ceWalls = chain.strikes
    .filter((r) => r.ce_oi != null && maxCE > 0 && r.ce_oi / maxCE >= OI_WALL_THRESHOLD)
    .sort((a, b) => (b.ce_oi ?? 0) - (a.ce_oi ?? 0))
    .slice(0, MAX_WALLS / 2)

  const peWalls = chain.strikes
    .filter((r) => r.pe_oi != null && maxPE > 0 && r.pe_oi / maxPE >= OI_WALL_THRESHOLD)
    .sort((a, b) => (b.pe_oi ?? 0) - (a.pe_oi ?? 0))
    .slice(0, MAX_WALLS / 2)

  const overlays: ComputedOverlay[] = []

  for (const wall of ceWalls) {
    overlays.push({
      indicatorId: `oi-ce-${wall.strike_price}`,
      lineId: 'wall',
      overlayType: 'line',
      color: 'rgba(239,68,68,0.7)',
      thickness: 1,
      points: [
        { time: firstTs, value: wall.strike_price },
        { time: lastTs, value: wall.strike_price },
      ],
    })
  }

  for (const wall of peWalls) {
    overlays.push({
      indicatorId: `oi-pe-${wall.strike_price}`,
      lineId: 'wall',
      overlayType: 'line',
      color: 'rgba(34,197,94,0.7)',
      thickness: 1,
      points: [
        { time: firstTs, value: wall.strike_price },
        { time: lastTs, value: wall.strike_price },
      ],
    })
  }

  // Max pain as a gold dashed line
  if (chain.max_pain != null) {
    overlays.push({
      indicatorId: 'oi-max-pain',
      lineId: 'max-pain',
      overlayType: 'line',
      color: 'rgba(234,179,8,0.85)',
      thickness: 1,
      points: [
        { time: firstTs, value: chain.max_pain },
        { time: lastTs, value: chain.max_pain },
      ],
    })
  }

  return overlays
}

export default function OIWallChart({ candles, loading, latestPrice, optionChain, isStale, sessionDate, fetchError }: OIWallChartProps) {
  const overlays = buildOIWallOverlays(optionChain, candles)

  return (
    <div className="oi-wall-chart-wrap">
      <div className="oi-wall-chart-legend">
        {isStale && sessionDate && <span className="oi-wall-stale-label">{sessionDate}</span>}
        <span className="oi-wall-legend-item oi-wall-legend-ce">CE OI wall (resistance)</span>
        <span className="oi-wall-legend-item oi-wall-legend-pe">PE OI wall (support)</span>
        <span className="oi-wall-legend-item oi-wall-legend-mp">Max pain</span>
      </div>
      <ScalperLiveChart
        panel="underlying"
        accent="blue"
        title="NIFTY"
        displayName="NIFTY 50"
        lastPrice={latestPrice}
        interval="1m"
        exchange="NSE"
        fallbackCandles={candles}
        overlays={overlays}
        signals={[]}
        height={300}
        hasData={candles.length > 0}
        emptyLabel={loading ? 'Loading NIFTY chart...' : fetchError ? `Chart unavailable: ${fetchError.slice(0, 80)}` : 'No chart data yet'}
        onSeriesReady={() => undefined}
      />
    </div>
  )
}
