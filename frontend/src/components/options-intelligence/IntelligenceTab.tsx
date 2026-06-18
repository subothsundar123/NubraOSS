import type { OIEIntelligenceResponse } from './useOIEData'
import { PCRGauge } from './OIECharts'

interface Props {
  data: OIEIntelligenceResponse
}

function biasClass(bias: string): string {
  const b = bias.toLowerCase()
  if (b === 'bullish') return 'bullish'
  if (b === 'bearish') return 'bearish'
  if (b === 'mixed') return 'mixed'
  return 'neutral'
}

function badgeClass(val: string): string {
  const v = val.toLowerCase()
  if (v.includes('positive') || v.includes('stabilising') || v.includes('bullish') || v.includes('high') || v === 'compressed') return 'positive'
  if (v.includes('negative') || v.includes('amplifying') || v.includes('bearish') || v.includes('extreme') || v.includes('elevated')) return 'negative'
  if (v.includes('neutral') || v.includes('normal') || v.includes('medium')) return 'neutral'
  return 'accent'
}

function cardValueClass(trend: string): string {
  if (trend === 'up') return 'bullish'
  if (trend === 'down') return 'bearish'
  return 'neutral'
}

const CARD_CONFIGS = [
  { key: 'gamma_regime',    label: 'Gamma Regime' },
  { key: 'vol_regime',      label: 'Volatility Regime' },
  { key: 'dealer_pos',      label: 'Dealer Positioning' },
  { key: 'expected_move',   label: 'Expected Move (Daily)' },
  { key: 'seller_favor',    label: 'Option Seller Edge' },
  { key: 'pcr_card',        label: 'Put-Call Ratio' },
]

export default function IntelligenceTab({ data }: Props) {
  const ms = data.metric_summary
  const metrics = data.metrics || {}

  // Build card data
  const cards = [
    {
      key: 'gamma_regime',
      label: 'Gamma Regime',
      value: data.gamma_regime,
      interp: metrics.gamma_regime?.interpretation || '',
      trend: metrics.gamma_regime?.trend || 'neutral',
    },
    {
      key: 'vol_regime',
      label: 'Volatility Regime',
      value: data.volatility_regime,
      interp: metrics.vol_regime?.interpretation || '',
      trend: metrics.vol_regime?.trend || 'neutral',
    },
    {
      key: 'dealer_pos',
      label: 'Dealer Positioning',
      value: data.dealer_positioning,
      interp: metrics.hedging_pressure?.interpretation || '',
      trend: data.dealer_positioning === 'Stabilising' ? 'up' : data.dealer_positioning === 'Amplifying' ? 'down' : 'neutral',
    },
    {
      key: 'expected_move',
      label: 'Expected Move / Day',
      value: data.expected_move_daily,
      interp: metrics.expected_move?.interpretation || '',
      trend: 'neutral',
    },
    {
      key: 'seller_favor',
      label: 'Option Seller Edge',
      value: data.option_seller_favorability,
      interp: metrics.iv_rank?.interpretation || metrics.atm_iv?.interpretation || '',
      trend: data.option_seller_favorability === 'High' ? 'up' : data.option_seller_favorability === 'Low' ? 'down' : 'neutral',
    },
    {
      key: 'pcr',
      label: 'Put-Call Ratio',
      value: ms.pcr ?? 'N/A',
      interp: metrics.pcr?.interpretation || '',
      trend: metrics.pcr?.trend || 'neutral',
    },
    {
      key: 'atm_iv',
      label: 'ATM Implied Volatility',
      value: ms.atm_iv ?? 'N/A',
      interp: metrics.atm_iv?.interpretation || '',
      trend: metrics.atm_iv?.trend || 'neutral',
    },
    {
      key: 'iv_rank',
      label: 'IV Rank',
      value: ms.iv_rank ?? 'N/A',
      interp: metrics.iv_rank?.interpretation || '',
      trend: metrics.iv_rank?.trend || 'neutral',
    },
  ]

  const kl = data.key_levels

  return (
    <div>
      {/* Market Bias Hero */}
      <div className="intel-bias-hero">
        <div className="intel-bias-label-wrap">
          <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-faint)', marginBottom: 4 }}>
            Market Bias
          </div>
          <div className={`intel-bias-label ${biasClass(data.market_bias)}`}>
            {data.market_bias}
          </div>
        </div>
        <div className="intel-confidence-wrap">
          <div className="intel-confidence-label">Confidence</div>
          <div className="intel-confidence-bar">
            <div
              className="intel-confidence-fill"
              style={{ width: `${data.confidence_score}%` }}
            />
          </div>
          <div className="intel-confidence-value">{data.confidence_score.toFixed(0)}%</div>
        </div>
        {data.spot_price != null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-faint)' }}>
              {data.underlying}
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>
              {data.spot_price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </div>
            {data.atm_strike != null && (
              <div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>ATM {data.atm_strike}</div>
            )}
          </div>
        )}
      </div>

      {/* Regime Badges */}
      <div className="intel-badges">
        <span className={`intel-badge ${badgeClass(data.gamma_regime)}`}>
          {data.gamma_regime} Gamma
        </span>
        <span className={`intel-badge ${badgeClass(data.volatility_regime)}`}>
          {data.volatility_regime} Vol
        </span>
        <span className={`intel-badge ${badgeClass(data.dealer_positioning)}`}>
          {data.dealer_positioning}
        </span>
        <span className={`intel-badge ${badgeClass(data.option_seller_favorability + ' favorability')}`}>
          Seller Edge: {data.option_seller_favorability}
        </span>
        <span className="intel-badge neutral">
          EM {data.expected_move_daily}
        </span>
        {data.expected_move_weekly !== 'N/A' && (
          <span className="intel-badge neutral">
            Weekly {data.expected_move_weekly}
          </span>
        )}
      </div>

      {/* PCR Gauge + Key Levels — unified card */}
      <div className="intel-snapshot">
        <div className="intel-snapshot-gauge">
          <div className="oie-chart-title">Put–Call Ratio</div>
          <PCRGauge pcr={metrics.pcr?.value ?? null} />
        </div>
        <div className="intel-snapshot-levels">
          <div className="oie-chart-title">Key Levels</div>
          {([
            { label: 'Call Wall', v: kl.call_wall, color: '#EF4444' },
            { label: 'Spot',      v: kl.spot,      color: 'rgba(255,255,255,.85)' },
            { label: 'γ Flip',    v: kl.gamma_flip, color: '#6FD1D7' },
            { label: 'Max Pain',  v: kl.max_pain,   color: '#F59E0B' },
            { label: 'Put Wall',  v: kl.put_wall,   color: '#22C55E' },
          ] as { label: string; v: number | null; color: string }[])
            .filter(e => e.v != null)
            .map(({ label, v, color }) => (
              <div key={label} className="intel-kl-row">
                <div className="intel-kl-label">
                  <span className="intel-kl-dot" style={{ background: color }} />
                  {label}
                </div>
                <div className="intel-kl-value" style={{ color }}>
                  {v!.toLocaleString('en-IN')}
                </div>
              </div>
            ))
          }
        </div>
      </div>

      {/* Metric Cards */}
      <div className="intel-cards-grid">
        {cards.map((c) => (
          <div key={c.key} className="intel-card">
            <div className="intel-card-label">{c.label}</div>
            <div className={`intel-card-value ${cardValueClass(c.trend)}`}>{c.value}</div>
            {c.interp && <div className="intel-card-interp">{c.interp}</div>}
          </div>
        ))}
      </div>

      {/* Interpretation Bullets */}
      {data.interpretation_bullets.length > 0 && (
        <div className="intel-bullets">
          <div className="intel-bullets-title">Signal Analysis</div>
          {data.interpretation_bullets.map((bullet, i) => (
            <div key={i} className="intel-bullet">
              <div className="intel-bullet-dot" />
              <span>{bullet}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
