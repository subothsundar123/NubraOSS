import { useState, useEffect } from 'react'
import { useOptionChain } from '../../positioning/useOptionChain'
import { useIndexCandles } from '../../positioning/useIndexCandles'
import type { DrawerCandle } from '../../positioning/useInstrumentContext'
import OptionsHeaderStrip from './OptionsHeaderStrip'
import OptionChainTable, { type SelectedOption } from './OptionChainTable'
import OIWallChart from './OIWallChart'
import OIBuildupPanel from './OIBuildupPanel'
import PCRPanel from './PCRPanel'
import IVSkewPanel from './IVSkewPanel'
import TradePanel, { type OptionInstrument } from './TradePanel'
import PositionsPanel from './PositionsPanel'
import OrdersPanel from './OrdersPanel'

type Env = 'PROD' | 'UAT'
type DrawerTab = 'trade' | 'positions' | 'orders'
type ChartTab = 'chart' | 'oi' | 'pcr' | 'iv'

interface OptionsViewProps {
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
  onRequestEnvAuth?: (env: Env) => void
}

const CHART_TAB_LABELS: Record<ChartTab, string> = {
  chart: 'Chart',
  oi: 'OI Buildup',
  pcr: 'PCR',
  iv: 'IV Skew',
}

interface DrilldownPoint {
  time_ist: string
  epoch_ms?: number | null
  open?: number | null
  high?: number | null
  low?: number | null
  close: number
  volume: number
}

function toCandles(points: DrilldownPoint[]): DrawerCandle[] {
  return points.map((point, index) => {
    const prev = points[index - 1]?.close ?? point.close
    const open = point.open ?? prev
    const high = point.high ?? Math.max(open, point.close)
    const low = point.low ?? Math.min(open, point.close)
    return {
      epoch_ms: point.epoch_ms ?? Date.now() - (points.length - index) * 60_000,
      open,
      high,
      low,
      close: point.close,
      volume: point.volume,
    }
  })
}

export default function OptionsView({ session, executionSession, onRequestEnvAuth }: OptionsViewProps) {
  const [chartTab, setChartTab] = useState<ChartTab>('chart')
  const [selectedOption, setSelectedOption] = useState<SelectedOption | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('positions')

  const [optionCandles, setOptionCandles] = useState<DrawerCandle[]>([])
  const [optionCandlesLoading, setOptionCandlesLoading] = useState(false)
  const [optionCandlesError, setOptionCandlesError] = useState<string | null>(null)

  const { data, loading, error, isStale: chainStale, refetch } = useOptionChain({
    enabled: true,
    underlying: 'NIFTY',
    sessionToken: session.access_token,
    deviceId: session.device_id,
    environment: session.environment,
  })

  const { candles, loading: candlesLoading, latestPrice, isStale: candlesStale, sessionDate, fetchError: candlesFetchError } = useIndexCandles({
    enabled: true,
    underlying: 'NIFTY',
    sessionToken: session.access_token,
    deviceId: session.device_id,
    environment: session.environment,
    spotPrice: data?.spot_price,
  })

  const livePrice = data?.spot_price ?? latestPrice ?? null
  const isStale = chainStale || candlesStale

  // Auto-open drawer on trade tab when an option is selected
  useEffect(() => {
    if (selectedOption) {
      setDrawerOpen(true)
      setDrawerTab('trade')
    }
  }, [selectedOption?.strike, selectedOption?.optionType])

  useEffect(() => {
    if (!selectedOption) {
      setOptionCandles([])
      setOptionCandlesError(null)
      return
    }
    let cancelled = false
    setOptionCandlesLoading(true)
    setOptionCandlesError(null)
    fetch('/api/positioning/option-candles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_token: session.access_token,
        device_id: session.device_id,
        environment: session.environment,
        underlying: selectedOption.underlying,
        strike_price: selectedOption.strike,
        option_type: selectedOption.optionType,
        expiry: selectedOption.expiry,
      }),
    })
      .then(async (r) => {
        const payload = await r.json() as { points?: DrilldownPoint[]; fetch_error?: string | null }
        if (!cancelled) {
          setOptionCandles(toCandles(payload.points ?? []))
          if (!payload.points?.length) {
            setOptionCandlesError(payload.fetch_error ?? 'No chart data available for this option.')
          }
        }
      })
      .catch(() => { if (!cancelled) setOptionCandlesError('Failed to load option chart.') })
      .finally(() => { if (!cancelled) setOptionCandlesLoading(false) })
    return () => { cancelled = true }
  }, [selectedOption?.strike, selectedOption?.optionType, session.access_token, session.device_id, session.environment])

  const execSession = executionSession ?? null

  function handleDrawerTabClick(tab: DrawerTab) {
    if (tab === drawerTab && drawerOpen) {
      setDrawerOpen(false)
    } else {
      setDrawerTab(tab)
      setDrawerOpen(true)
    }
  }

  return (
    <div className="options-view">
      <OptionsHeaderStrip data={data} latestPrice={livePrice} loading={loading} isStale={isStale} />

      <div className="options-view-body">
        {/* Left panel — chart tabs */}
        <div className="options-view-chart-col">
          <div className="options-panel-tabs" role="tablist">
            {(Object.keys(CHART_TAB_LABELS) as ChartTab[]).map(tab => (
              <button
                key={tab}
                role="tab"
                aria-selected={chartTab === tab}
                className={`options-tab${chartTab === tab ? ' active' : ''}`}
                onClick={() => setChartTab(tab)}
              >
                {CHART_TAB_LABELS[tab]}
              </button>
            ))}
            {isStale && (
              <span className="options-stale-inline">⏸ Closed</span>
            )}
          </div>

          <div className="options-panel-body">
            {chartTab === 'chart' && !selectedOption && (
              <OIWallChart
                candles={candles}
                loading={candlesLoading}
                latestPrice={livePrice}
                optionChain={data}
                isStale={candlesStale}
                sessionDate={sessionDate}
                fetchError={candlesFetchError}
              />
            )}
            {chartTab === 'chart' && selectedOption && (
              <OIWallChart
                candles={optionCandles}
                loading={optionCandlesLoading}
                latestPrice={selectedOption.ltp}
                optionChain={null}
                isStale={false}
                sessionDate={null}
                fetchError={optionCandlesError}
              />
            )}
            {chartTab === 'oi' && <OIBuildupPanel data={data} loading={loading} />}
            {chartTab === 'pcr' && <PCRPanel data={data} loading={loading} />}
            {chartTab === 'iv' && <IVSkewPanel data={data} loading={loading} />}
          </div>
        </div>

        {/* Right panel — option chain */}
        <div className="options-view-chain-col">
          <OptionChainTable
            data={data}
            loading={loading}
            error={error}
            isStale={chainStale}
            selectedStrike={selectedOption?.strike ?? null}
            selectedType={selectedOption?.optionType ?? null}
            onSelectOption={setSelectedOption}
            onRetry={refetch}
          />
        </div>
      </div>

      {/* Side drawer — Trade / Positions / Orders */}
      <aside className={`options-trade-drawer${drawerOpen ? ' is-open' : ''}`}>
        {/* Persistent toggle tab with sub-tabs */}
        <div className="options-drawer-side-tabs">
          <button
            className={`options-drawer-side-tab${drawerTab === 'trade' && drawerOpen ? ' active' : ''}`}
            onClick={() => handleDrawerTabClick('trade')}
            title="Trade"
          >
            <span>Trade</span>
          </button>
          <button
            className={`options-drawer-side-tab${drawerTab === 'positions' && drawerOpen ? ' active' : ''}`}
            onClick={() => handleDrawerTabClick('positions')}
            title="Positions"
          >
            <span>Pos</span>
          </button>
          <button
            className={`options-drawer-side-tab${drawerTab === 'orders' && drawerOpen ? ' active' : ''}`}
            onClick={() => handleDrawerTabClick('orders')}
            title="Orders"
          >
            <span>Orders</span>
          </button>
        </div>

        <div className="drawer-content">
          {/* Tab bar inside drawer */}
          <div className="options-drawer-inner-tabs">
            {(['trade', 'positions', 'orders'] as DrawerTab[]).map(tab => (
              <button
                key={tab}
                className={`options-drawer-inner-tab${drawerTab === tab ? ' active' : ''}`}
                onClick={() => setDrawerTab(tab)}
              >
                {tab === 'trade' ? 'Trade' : tab === 'positions' ? 'Positions' : 'Orders'}
              </button>
            ))}
          </div>

          {drawerTab === 'trade' && (
            <>
              {selectedOption ? (
                <>
                  <div className="options-trade-drawer-header">
                    <span className="options-trade-drawer-title">
                      {selectedOption.underlying} {selectedOption.strike}
                    </span>
                    <span className={`options-trade-type-badge ${selectedOption.optionType === 'CE' ? 'ce' : 'pe'}`}>
                      {selectedOption.optionType}
                    </span>
                    {selectedOption.ltp != null && (
                      <span className="options-trade-ltp">
                        ₹{selectedOption.ltp.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    )}
                    <button
                      className="options-trade-close-btn"
                      onClick={() => setSelectedOption(null)}
                      title="Deselect option"
                    >✕</button>
                  </div>
                  <TradePanel
                    instrument={{
                      mode: 'option',
                      underlying: selectedOption.underlying,
                      strikePrice: selectedOption.strike,
                      optionType: selectedOption.optionType,
                      expiry: selectedOption.expiry,
                      ltp: selectedOption.ltp,
                      ref_id: selectedOption.ref_id ?? null,
                    } satisfies OptionInstrument}
                    suggestedPrice={selectedOption.ltp}
                    session={session}
                    executionSession={executionSession}
                    defaultSide="BUY"
                    onOrderPlaced={(_, __, env) => {
                      setTimeout(() => { setDrawerTab('orders') }, 1200)
                      void env
                    }}
                    onRequestEnvAuth={onRequestEnvAuth}
                  />
                </>
              ) : (
                <div className="options-panel-empty" style={{ minHeight: 160 }}>
                  Select a strike from the chain to trade
                </div>
              )}
            </>
          )}

          {drawerTab === 'positions' && (
            <PositionsPanel session={session} executionSession={execSession} />
          )}

          {drawerTab === 'orders' && (
            <OrdersPanel session={session} executionSession={execSession} />
          )}
        </div>
      </aside>
    </div>
  )
}
