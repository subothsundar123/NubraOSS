import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

import DashboardGrid from '../dashboard/DashboardGrid'
import DashboardShell from '../dashboard/DashboardShell'
import AlertRail from './AlertRail'
import BreadthPanel from './BreadthPanel'
import CommentaryRail from './CommentaryRail'
import InstrumentDetailDrawer from './InstrumentDetailDrawer'
import MarketInternalsPanel from './MarketInternalsPanel'
import MarketStateStrip from './MarketStateStrip'
import OpportunityTable from './OpportunityTable'
import OptionsPressureBoard from './OptionsPressureBoard'
import OptionsView from './OptionsView'
import SectorRotationMap from './SectorRotationMap'
import { PositioningProvider, usePositioning } from '../../positioning/PositioningProvider'

type DashboardMode = 'equity' | 'options'

type Env = 'PROD' | 'UAT'

interface PositioningDashboardProps {
  session: {
    access_token: string
    device_id: string
    environment: Env
    user_name?: string
    is_demo?: boolean
  }
  executionSession?: {
    access_token: string
    device_id: string
    environment: Env
  } | null
  onBack: () => void
  onOpenScalper?: (symbol: string) => void
  onRequestEnvAuth?: (env: Env) => void
  renderNav: (activeTab: string) => React.ReactNode
}

function DashboardBody({ session, executionSession, onBack, onOpenScalper, onRequestEnvAuth, renderNav }: Pick<PositioningDashboardProps, 'session' | 'executionSession' | 'onBack' | 'onOpenScalper' | 'onRequestEnvAuth' | 'renderNav'>) {
  const { snapshot, connection } = usePositioning()
  const [mode, setMode] = useState<DashboardMode>('equity')
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)

  // Fire intraday bootstrap once per session to pre-warm the positioning engines
  // with today's 1m candle data before the live scanner finishes hydration.
  const bootstrapFired = useRef(false)
  useEffect(() => {
    if (bootstrapFired.current || session.is_demo) return
    bootstrapFired.current = true
    const timer = setTimeout(() => {
      fetch('/api/positioning/intraday-bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_token: session.access_token,
          device_id: session.device_id,
          environment: session.environment,
          max_symbols: 100,
        }),
      }).catch(() => { /* non-critical — scanner will catch up on its own */ })
    }, 4000) // 4s delay lets the scanner bootstrap call complete first
    return () => clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const topSymbol = snapshot?.opportunities?.rows?.[0]?.symbol ?? null
  const activeSymbol = selectedSymbol ?? topSymbol
  const radarMeta = useMemo(() => {
    const count = snapshot?.opportunities?.rows?.length ?? 0
    const leader = snapshot?.opportunities?.rows?.[0]
    return count
      ? `${count} setups ranked / leader ${leader?.symbol ?? '--'} at ${(leader?.quality_score ?? 0).toFixed(1)}`
      : 'Waiting for scanner cache'
  }, [snapshot])

  return (
    <div className="subview-shell positioning-view">
      {renderNav('Positioning')}
      <DashboardShell
        eyebrow="Intraday Positioning Model"
        title="Market Intelligence OS"
        subtitle={mode === 'equity' ? radarMeta : 'NIFTY options — live chain, OI walls, PCR'}
        headerExtra={
          <div className="positioning-mode-toggle" role="tablist" aria-label="Dashboard mode">
            <span className={`seg-pill${mode === 'options' ? ' right' : ''}`} />
            <button
              role="tab"
              aria-selected={mode === 'equity'}
              className={mode === 'equity' ? 'active' : ''}
              onClick={() => setMode('equity')}
            >
              Equities
            </button>
            <button
              role="tab"
              aria-selected={mode === 'options'}
              className={mode === 'options' ? 'active' : ''}
              onClick={() => setMode('options')}
            >
              Options
            </button>
          </div>
        }
      >
        <MarketStateStrip snapshot={snapshot} connection={connection} />
        {connection.error ? <div className="err-banner">{connection.error}</div> : null}

        {mode === 'equity' && (
          <>
            <div className="positioning-terminal-layout">
              <section className="positioning-main-focus">
                <DashboardGrid>
                  <OpportunityTable
                    opportunities={snapshot?.opportunities}
                    selectedSymbol={activeSymbol}
                    onSelect={setSelectedSymbol}
                  />
                  <MarketInternalsPanel internals={snapshot?.market_internals} />
                  <SectorRotationMap sectorRotation={snapshot?.sector_rotation} />
                  <BreadthPanel breadth={snapshot?.breadth} />
                  <OptionsPressureBoard options={snapshot?.options_pressure} />
                </DashboardGrid>
              </section>
              <aside className="positioning-side-rail">
                <CommentaryRail commentary={snapshot?.commentary} />
                <AlertRail alerts={snapshot?.alerts} />
              </aside>
            </div>
            <InstrumentDetailDrawer
              symbol={selectedSymbol}
              leaderSymbol={topSymbol}
              snapshot={snapshot}
              session={session}
              onClose={() => setSelectedSymbol(null)}
              onOpenScalper={onOpenScalper}
            />
          </>
        )}

        {mode === 'options' && (
          <OptionsView
            session={session}
            executionSession={executionSession}
            onRequestEnvAuth={onRequestEnvAuth}
          />
        )}
      </DashboardShell>
    </div>
  )
}

export default function PositioningDashboard({ session, executionSession, onBack, onOpenScalper, onRequestEnvAuth, renderNav }: PositioningDashboardProps) {
  return (
    <PositioningProvider
      init={{
        sessionToken: session.access_token,
        deviceId: session.device_id,
        environment: session.environment,
        enabled: Boolean(session),
      }}
    >
      <DashboardBody
        session={session}
        executionSession={executionSession}
        onBack={onBack}
        onOpenScalper={onOpenScalper}
        onRequestEnvAuth={onRequestEnvAuth}
        renderNav={renderNav}
      />
    </PositioningProvider>
  )
}
