import './oie.css'
import { useOIEStream } from './useOIEStream'
import type { StreamStatus } from './useOIEStream'
import IntelligenceTab from './IntelligenceTab'
import AnalyticsTab from './AnalyticsTab'
import SignalsTab from './SignalsTab'
import StrategyBuilderTab from './StrategyBuilderTab'
import AlertsTab from './AlertsTab'
import AutomationTab from './AutomationTab'
import ChainTab from './ChainTab'
import type { TrackRequest } from './ChainTab'
import AddPositionModal from './AddPositionModal'
import PositionTrackerPanel from './PositionTrackerPanel'
import { usePositionTracker } from './usePositionTracker'
import { useLtpStream } from './useLtpStream'
import type { LtpRef } from './useLtpStream'
import { useState, useMemo, useRef } from 'react'

type OIETab = 'intelligence' | 'analytics' | 'signals' | 'strategy' | 'alerts' | 'automation' | 'chain' | 'positions'

const TABS: { key: OIETab; label: string }[] = [
  { key: 'intelligence', label: 'Intelligence' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'signals', label: 'Signals' },
  { key: 'chain', label: 'Chain' },
  { key: 'positions', label: 'Positions' },
  { key: 'strategy', label: 'Strategy' },
  { key: 'alerts', label: 'Alerts' },
  { key: 'automation', label: 'Automation' },
]

const UNDERLYINGS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX']

const STATUS_DOT: Record<StreamStatus, { color: string; label: string; pulse: boolean }> = {
  connecting:   { color: '#f59e0b', label: 'Connecting',   pulse: true  },
  live:         { color: '#22c55e', label: 'Live',         pulse: true  },
  reconnecting: { color: '#ef4444', label: 'Reconnecting', pulse: true  },
  closed:       { color: '#6b7280', label: 'Closed',       pulse: false },
}

interface Props {
  sessionToken: string
  deviceId: string
  environment: string
}

export default function OptionsIntelligenceEngine({ sessionToken, deviceId, environment }: Props) {
  const [activeTab, setActiveTab] = useState<OIETab>('intelligence')
  const [trackRequest, setTrackRequest] = useState<TrackRequest | null>(null)

  const {
    intelligence, chain, signalReport,
    status, error, lastUpdate,
    underlying, expiry,
    switchUnderlying, setExpiry,
  } = useOIEStream({ sessionToken, deviceId, environment, initialUnderlying: 'NIFTY', intervalSeconds: 30 })

  // ltpMapRef holds the most-recently resolved fast LTP map so that usePositionTracker
  // (called above in hook order) can use it on the next render without a circular dependency.
  const ltpMapRef = useRef<Map<string, number>>(new Map())

  const { livePositions, positions, addPosition, removePosition, updateSl, updateTarget } =
    usePositionTracker(chain, signalReport, intelligence, ltpMapRef.current)

  // Build the minimal set of ref_ids to poll — only the strikes that are actually tracked
  const ltpRefs = useMemo<LtpRef[]>(() => {
    if (!chain?.strikes || positions.length === 0) return []
    const strikeRefMap = new Map<string, number>()
    for (const s of chain.strikes) {
      if (s.ce_ref_id) strikeRefMap.set(`${s.strike_price}-CE`, s.ce_ref_id)
      if (s.pe_ref_id) strikeRefMap.set(`${s.strike_price}-PE`, s.pe_ref_id)
    }
    return positions
      .map(p => {
        const label = `${p.strike}-${p.optionType}`
        const ref_id = strikeRefMap.get(label)
        return ref_id ? { ref_id, label } : null
      })
      .filter(Boolean) as LtpRef[]
  }, [positions, chain])

  const { ltpMap, status: ltpStatus } = useLtpStream({
    sessionToken,
    deviceId,
    environment,
    refs: ltpRefs,
    intervalSeconds: 2,
  })

  // Store for the next render — usePositionTracker will pick it up on the next re-render
  ltpMapRef.current = ltpMap

  const dot = STATUS_DOT[status]

  const timeSince = lastUpdate
    ? Math.round((Date.now() - lastUpdate.getTime()) / 1000)
    : null

  // Build metrics map for strategy builder live preview
  const metricsForStrategy: Record<string, { value: number | null; formatted: string }> = {}
  if (intelligence?.metrics) {
    Object.entries(intelligence.metrics).forEach(([k, m]) => {
      metricsForStrategy[k] = { value: m.value, formatted: m.formatted }
    })
  }

  return (
    <div className="oie-root">
      {/* Header Strip */}
      <div className="oie-header-strip">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.04em', color: 'var(--fg)' }}>
            Options Intelligence
          </span>

          {/* Underlying Selector */}
          <div style={{ display: 'flex', gap: 4 }}>
            {UNDERLYINGS.map((u) => (
              <button
                key={u}
                className={`oie-underlying-btn${underlying === u ? ' active' : ''}`}
                onClick={() => switchUnderlying(u, expiry)}
              >
                {u}
              </button>
            ))}
          </div>

          {/* Optional Expiry */}
          <input
            className="condition-value-input"
            style={{ width: 110 }}
            placeholder="Expiry (opt)"
            value={expiry}
            onChange={(e) => {
              setExpiry(e.target.value)
              if (!e.target.value || e.target.value.length >= 6) {
                switchUnderlying(underlying, e.target.value)
              }
            }}
            title="Leave blank for nearest expiry"
          />
        </div>

        {/* Right: live status + spot price */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          {/* Live dot */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              display: 'inline-block',
              width: 8, height: 8,
              borderRadius: '50%',
              background: dot.color,
              boxShadow: dot.pulse ? `0 0 0 0 ${dot.color}` : 'none',
              animation: dot.pulse ? 'oie-pulse 2s infinite' : 'none',
            }} />
            <span style={{ fontSize: 11, color: 'var(--fg-faint)', letterSpacing: '0.04em' }}>
              {dot.label}
              {timeSince != null && status === 'live' && (
                <span style={{ marginLeft: 4 }}>
                  · {timeSince < 60 ? `${timeSince}s ago` : `${Math.round(timeSince / 60)}m ago`}
                </span>
              )}
            </span>
          </div>

          {intelligence?.spot_price != null && (
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {underlying}{' '}
              <span style={{ color: 'var(--accent)' }}>
                {intelligence.spot_price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Tab Bar */}
      <div className="oie-tab-bar">
        {TABS.map((t) => {
          const isPositions = t.key === 'positions'
          const posCount = livePositions.length
          const alertCount = livePositions.filter(p => p.urgency === 'high').length
          return (
            <button
              key={t.key}
              className={`oie-tab${activeTab === t.key ? ' active' : ''}`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
              {isPositions && posCount > 0 && (
                <span className={`oie-tab-badge${alertCount > 0 ? ' alert' : ''}`}>
                  {posCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Error Banner */}
      {error && (
        <div style={{
          margin: '0 0 12px',
          padding: '10px 14px',
          background: 'rgba(220,50,50,0.08)',
          border: '1px solid var(--neg)',
          borderRadius: 6,
          fontSize: 13,
          color: 'var(--neg)',
        }}>
          {error}
        </div>
      )}

      {/* Content */}
      <div className="oie-content">
        {activeTab === 'intelligence' && (
          !intelligence
            ? <div className="oie-loading">
                {status === 'connecting' ? 'Connecting to live feed…' : 'Waiting for first data push…'}
              </div>
            : <IntelligenceTab data={intelligence} />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsTab metrics={intelligence?.metrics || {}} spotPrice={intelligence?.spot_price} />
        )}

        {activeTab === 'signals' && (
          intelligence
            ? <SignalsTab data={intelligence} signalReport={signalReport} />
            : <div className="oie-loading">Waiting for live data…</div>
        )}

        {activeTab === 'strategy' && (
          <StrategyBuilderTab
            sessionToken={sessionToken}
            deviceId={deviceId}
            environment={environment}
            currentMetrics={metricsForStrategy}
          />
        )}

        {activeTab === 'alerts' && (
          <AlertsTab
            sessionToken={sessionToken}
            deviceId={deviceId}
            environment={environment}
            underlying={underlying}
          />
        )}

        {activeTab === 'automation' && (
          <AutomationTab
            sessionToken={sessionToken}
            deviceId={deviceId}
            environment={environment}
            underlying={underlying}
            marketBias={intelligence?.market_bias}
            confidence={intelligence?.confidence_score}
            chain={chain}
            signalReport={signalReport}
          />
        )}

        {activeTab === 'chain' && (
          <ChainTab
            chain={chain}
            spotPrice={intelligence?.spot_price}
            onTrackPosition={setTrackRequest}
            signalReport={signalReport}
            intelligence={intelligence}
          />
        )}

        {activeTab === 'positions' && (
          <>
            <div style={{
              padding: '6px 20px',
              borderBottom: '1px solid var(--hairline)',
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--bg-2)',
            }}>
              <span style={{
                display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
                background: ltpStatus === 'live' ? '#22c55e' : ltpStatus === 'connecting' ? '#f59e0b' : '#6b7280',
                animation: ltpStatus !== 'disconnected' ? 'oie-pulse 2s infinite' : 'none',
              }} />
              <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>
                Fast LTP ({ltpStatus === 'live' ? '~2s' : ltpStatus === 'connecting' ? 'connecting…' : 'disconnected'})
              </span>
              {ltpStatus === 'disconnected' && (
                <span style={{ fontSize: 10, color: 'var(--neg)', marginLeft: 4 }}>
                  — restart backend to enable live P&amp;L
                </span>
              )}
            </div>
            <PositionTrackerPanel
              positions={livePositions}
              onRemove={removePosition}
              onApplySl={updateSl}
              onApplyTarget={updateTarget}
              inline
            />
          </>
        )}
      </div>

      {/* Add Position Modal */}
      <AddPositionModal
        request={trackRequest}
        onConfirm={addPosition}
        onClose={() => setTrackRequest(null)}
      />

      {/* Market Closed Banner */}
      {chain?.market_closed && (
        <div style={{
          position: 'sticky', bottom: 0,
          padding: '8px 16px',
          background: 'var(--bg-2)',
          borderTop: '1px solid var(--hairline)',
          fontSize: 12,
          color: 'var(--fg-faint)',
          textAlign: 'center',
        }}>
          Market closed — showing last available snapshot · updates every 5 min
        </div>
      )}
    </div>
  )
}
