import type { OIEIntelligenceResponse } from './useOIEData'

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

      {/* Key Levels Strip */}
      {(kl.call_wall != null || kl.put_wall != null || kl.gamma_flip != null || kl.max_pain != null) && (
        <div className="intel-key-levels">
          {kl.call_wall != null && (
            <div className="intel-level-item">
              <div className="intel-level-label">Call Wall</div>
              <div className="intel-level-value call">{kl.call_wall.toLocaleString('en-IN')}</div>
            </div>
          )}
          {kl.call_wall != null && kl.put_wall != null && <div className="intel-level-sep" />}
          {kl.put_wall != null && (
            <div className="intel-level-item">
              <div className="intel-level-label">Put Wall</div>
              <div className="intel-level-value put">{kl.put_wall.toLocaleString('en-IN')}</div>
            </div>
          )}
          {kl.put_wall != null && kl.gamma_flip != null && <div className="intel-level-sep" />}
          {kl.gamma_flip != null && (
            <div className="intel-level-item">
              <div className="intel-level-label">Gamma Flip</div>
              <div className="intel-level-value flip">{kl.gamma_flip.toLocaleString('en-IN')}</div>
            </div>
          )}
          {kl.gamma_flip != null && kl.max_pain != null && <div className="intel-level-sep" />}
          {kl.max_pain != null && (
            <div className="intel-level-item">
              <div className="intel-level-label">Max Pain</div>
              <div className="intel-level-value pain">{kl.max_pain.toLocaleString('en-IN')}</div>
            </div>
          )}
          {kl.spot != null && (
            <>
              <div className="intel-level-sep" />
              <div className="intel-level-item">
                <div className="intel-level-label">Spot</div>
                <div className="intel-level-value neutral">{kl.spot.toLocaleString('en-IN')}</div>
              </div>
            </>
          )}
        </div>
      )}

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
