import React, { createContext, useContext, useMemo } from 'react'
import { usePositioningWS } from './usePositioningWS'
import type { PositioningConnectionState, PositioningInit, PositioningSnapshot } from './types'

interface PositioningContextValue {
  snapshot: PositioningSnapshot | null
  connection: PositioningConnectionState
}

const PositioningContext = createContext<PositioningContextValue | null>(null)

export function PositioningProvider({ init, children }: { init: PositioningInit; children: React.ReactNode }) {
  const { snapshot, connection } = usePositioningWS(init)
  const value = useMemo(() => ({ snapshot, connection }), [snapshot, connection])
  return <PositioningContext.Provider value={value}>{children}</PositioningContext.Provider>
}

export function usePositioning() {
  const context = useContext(PositioningContext)
  if (!context) throw new Error('usePositioning must be used within PositioningProvider')
  return context
}
