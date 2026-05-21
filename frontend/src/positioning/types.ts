export type PositioningDirection = 'bullish' | 'bearish' | 'neutral' | 'mixed'
export type PositioningStatus = 'bootstrapping' | 'ready' | 'degraded'

export interface PositioningScore {
  score: number
  direction: PositioningDirection
  confidence: number
  components: Record<string, number>
  explanation: string[]
  stale: boolean
  as_of: string
}

export interface BreadthSnapshot {
  score: PositioningScore
  advances: number
  declines: number
  unchanged: number
  up_volume: number
  down_volume: number
  participation_pct: number
  leaders: Record<string, unknown>[]
}

export interface SectorRotationSnapshot {
  score: PositioningScore
  sectors: Array<{
    sector: string
    strength: number
    avg_change_pct: number
    avg_volume_ratio: number
    breadth_pct: number
    symbols: number
  }>
  leadership: string[]
  concentration_score: number
}

export interface SentimentSnapshot {
  score: PositioningScore
  label: string
}

export interface RegimeSnapshot {
  score: PositioningScore
  regime: string
  label: string
}

export interface SmartMoneySnapshot {
  score: PositioningScore
  candidates: Array<Record<string, unknown>>
}

export interface OptionsPressureSnapshot {
  score: PositioningScore
  underlying: string
  call_pressure: number
  put_pressure: number
  zones: Array<Record<string, unknown>>
}

export interface MarketInternalsSnapshot {
  score: PositioningScore
  control_state: string
  transition_reason: string
  participation: Record<string, unknown>
  liquidity: Record<string, unknown>
  concentration: Record<string, unknown>
  acceptance: Record<string, unknown>
  activity: Record<string, unknown>
  thrusts: Array<Record<string, unknown>>
  evidence: string[]
}

export interface OpportunitySnapshot {
  score: PositioningScore
  rows: Array<{
    symbol: string
    display_name?: string
    exchange?: string
    sector?: string | null
    last_price?: number | null
    volume_ratio?: number
    change_pct?: number
    quality_score?: number
    reason?: string[]
  }>
}

export interface CommentaryItem {
  id: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  message: string
  created_at: string
  tags: string[]
}

export interface AlertItem {
  id: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  message: string
  created_at: string
  source: string
  payload: Record<string, unknown>
}

export interface PositioningSnapshot {
  version: number
  seq: number
  status: PositioningStatus
  universe: string
  generated_at: string
  market_status: string
  breadth: BreadthSnapshot
  sector_rotation: SectorRotationSnapshot
  sentiment: SentimentSnapshot
  regime: RegimeSnapshot
  smart_money: SmartMoneySnapshot
  options_pressure: OptionsPressureSnapshot
  market_internals: MarketInternalsSnapshot
  opportunities: OpportunitySnapshot
  commentary: CommentaryItem[]
  alerts: AlertItem[]
  feed_health: Record<string, unknown>
}

export interface PositioningInit {
  sessionToken: string
  deviceId: string
  environment: 'PROD' | 'UAT'
  enabled: boolean
}

export interface PositioningConnectionState {
  connected: boolean
  connecting: boolean
  error: string
  lastMessageAt: string | null
}
