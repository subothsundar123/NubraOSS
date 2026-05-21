import type {
  AlertItem,
  BreadthSnapshot,
  CommentaryItem,
  MarketInternalsSnapshot,
  OpportunitySnapshot,
  OptionsPressureSnapshot,
  PositioningDirection,
  PositioningScore,
  PositioningSnapshot,
  RegimeSnapshot,
  SectorRotationSnapshot,
  SentimentSnapshot,
  SmartMoneySnapshot,
} from './types'

function score(overrides: Partial<PositioningScore> = {}): PositioningScore {
  return {
    score: 50,
    direction: 'neutral',
    confidence: 0,
    components: {},
    explanation: ['Waiting for positioning data.'],
    stale: true,
    as_of: new Date().toISOString(),
    ...overrides,
  }
}

function direction(value: unknown): PositioningDirection {
  return value === 'bullish' || value === 'bearish' || value === 'mixed' || value === 'neutral'
    ? value
    : 'neutral'
}

function safeScore(value: unknown): PositioningScore {
  const candidate = value as Partial<PositioningScore> | undefined
  return score({
    score: typeof candidate?.score === 'number' ? candidate.score : 50,
    direction: direction(candidate?.direction),
    confidence: typeof candidate?.confidence === 'number' ? candidate.confidence : 0,
    components: candidate?.components && typeof candidate.components === 'object' ? candidate.components : {},
    explanation: Array.isArray(candidate?.explanation) ? candidate.explanation : ['Waiting for positioning data.'],
    stale: typeof candidate?.stale === 'boolean' ? candidate.stale : true,
    as_of: typeof candidate?.as_of === 'string' ? candidate.as_of : new Date().toISOString(),
  })
}

export function normalizePositioningSnapshot(payload: unknown): PositioningSnapshot {
  const raw = (payload && typeof payload === 'object' ? payload : {}) as Partial<PositioningSnapshot>
  const breadth = (raw.breadth ?? {}) as Partial<BreadthSnapshot>
  const sectors = (raw.sector_rotation ?? {}) as Partial<SectorRotationSnapshot>
  const sentiment = (raw.sentiment ?? {}) as Partial<SentimentSnapshot>
  const regime = (raw.regime ?? {}) as Partial<RegimeSnapshot>
  const smartMoney = (raw.smart_money ?? {}) as Partial<SmartMoneySnapshot>
  const options = (raw.options_pressure ?? {}) as Partial<OptionsPressureSnapshot>
  const internals = (raw.market_internals ?? {}) as Partial<MarketInternalsSnapshot>
  const opportunities = (raw.opportunities ?? {}) as Partial<OpportunitySnapshot>

  return {
    version: typeof raw.version === 'number' ? raw.version : 1,
    seq: typeof raw.seq === 'number' ? raw.seq : 0,
    status: raw.status === 'ready' || raw.status === 'degraded' || raw.status === 'bootstrapping' ? raw.status : 'bootstrapping',
    universe: typeof raw.universe === 'string' ? raw.universe : 'unknown',
    generated_at: typeof raw.generated_at === 'string' ? raw.generated_at : new Date().toISOString(),
    market_status: typeof raw.market_status === 'string' ? raw.market_status : 'unknown',
    breadth: {
      score: safeScore(breadth.score),
      advances: typeof breadth.advances === 'number' ? breadth.advances : 0,
      declines: typeof breadth.declines === 'number' ? breadth.declines : 0,
      unchanged: typeof breadth.unchanged === 'number' ? breadth.unchanged : 0,
      up_volume: typeof breadth.up_volume === 'number' ? breadth.up_volume : 0,
      down_volume: typeof breadth.down_volume === 'number' ? breadth.down_volume : 0,
      participation_pct: typeof breadth.participation_pct === 'number' ? breadth.participation_pct : 0,
      leaders: Array.isArray(breadth.leaders) ? breadth.leaders : [],
    },
    sector_rotation: {
      score: safeScore(sectors.score),
      sectors: Array.isArray(sectors.sectors) ? sectors.sectors : [],
      leadership: Array.isArray(sectors.leadership) ? sectors.leadership : [],
      concentration_score: typeof sectors.concentration_score === 'number' ? sectors.concentration_score : 0,
    },
    sentiment: {
      score: safeScore(sentiment.score),
      label: typeof sentiment.label === 'string' ? sentiment.label : 'Bootstrapping',
    },
    regime: {
      score: safeScore(regime.score),
      regime: typeof regime.regime === 'string' ? regime.regime : 'neutral',
      label: typeof regime.label === 'string' ? regime.label : 'Neutral',
    },
    smart_money: {
      score: safeScore(smartMoney.score),
      candidates: Array.isArray(smartMoney.candidates) ? smartMoney.candidates : [],
    },
    options_pressure: {
      score: safeScore(options.score),
      underlying: typeof options.underlying === 'string' ? options.underlying : 'NIFTY',
      call_pressure: typeof options.call_pressure === 'number' ? options.call_pressure : 0,
      put_pressure: typeof options.put_pressure === 'number' ? options.put_pressure : 0,
      zones: Array.isArray(options.zones) ? options.zones : [],
    },
    market_internals: {
      score: safeScore(internals.score),
      control_state: typeof internals.control_state === 'string' ? internals.control_state : 'rotational_balance',
      transition_reason: typeof internals.transition_reason === 'string' ? internals.transition_reason : 'Waiting for market internals.',
      participation: internals.participation && typeof internals.participation === 'object' ? internals.participation : {},
      liquidity: internals.liquidity && typeof internals.liquidity === 'object' ? internals.liquidity : {},
      concentration: internals.concentration && typeof internals.concentration === 'object' ? internals.concentration : {},
      acceptance: internals.acceptance && typeof internals.acceptance === 'object' ? internals.acceptance : {},
      activity: internals.activity && typeof internals.activity === 'object' ? internals.activity : {},
      thrusts: Array.isArray(internals.thrusts) ? internals.thrusts : [],
      evidence: Array.isArray(internals.evidence) ? internals.evidence : [],
    },
    opportunities: {
      score: safeScore(opportunities.score),
      rows: Array.isArray(opportunities.rows) ? opportunities.rows : [],
    },
    commentary: Array.isArray(raw.commentary) ? raw.commentary as CommentaryItem[] : [],
    alerts: Array.isArray(raw.alerts) ? raw.alerts as AlertItem[] : [],
    feed_health: raw.feed_health && typeof raw.feed_health === 'object' ? raw.feed_health : {},
  }
}
