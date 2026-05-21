import type React from 'react'
import { useMemo, useState } from 'react'

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
import SectorRotationMap from './SectorRotationMap'
import { PositioningProvider, usePositioning } from '../../positioning/PositioningProvider'

interface PositioningDashboardProps {
  session: {
    access_token: string
    device_id: string
    environment: 'PROD' | 'UAT'
    user_name?: string
    is_demo?: boolean
  }
  onBack: () => void
  onOpenScalper?: (symbol: string) => void
  renderNav: (activeTab: string) => React.ReactNode
}

function DashboardBody({ session, onBack, onOpenScalper, renderNav }: Pick<PositioningDashboardProps, 'session' | 'onBack' | 'onOpenScalper' | 'renderNav'>) {
  const { snapshot, connection } = usePositioning()
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)
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
        subtitle={radarMeta}
      >
        <MarketStateStrip snapshot={snapshot} connection={connection} />
        {connection.error ? <div className="err-banner">{connection.error}</div> : null}
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
      </DashboardShell>
    </div>
  )
}

export default function PositioningDashboard({ session, onBack, onOpenScalper, renderNav }: PositioningDashboardProps) {
  return (
    <PositioningProvider
      init={{
        sessionToken: session.access_token,
        deviceId: session.device_id,
        environment: session.environment,
        enabled: Boolean(session),
      }}
    >
      <DashboardBody session={session} onBack={onBack} onOpenScalper={onOpenScalper} renderNav={renderNav} />
    </PositioningProvider>
  )
}
