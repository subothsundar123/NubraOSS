import type { OIEIntelligenceResponse, OIESignalResponse, SignalItem } from './useOIEData'

interface Props {
  data: OIEIntelligenceResponse
  signalReport?: OIESignalResponse | null
}

const DIR_COLOR: Record<string, string> = {
  bullish: 'var(--pos)',
  bearish: 'var(--neg)',
  neutral: 'var(--fg-faint)',
}

const DIR_ARROW: Record<string, string> = {
  bullish: '↑',
  bearish: '↓',
  neutral: '—',
}

const CAT_LABEL: Record<string, string> = {
  oi: 'OI',
  volatility: 'VOL',
  dealer: 'GEX',
  composite: 'COMP',
}

function SignalRow({ s }: { s: SignalItem }) {
  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start',
      padding: '10px 0', borderBottom: '1px solid var(--hairline)',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
        color: DIR_COLOR[s.direction] || 'var(--fg-faint)',
        width: 20, flexShrink: 0, paddingTop: 2,
      }}>
        {DIR_ARROW[s.direction] || '—'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{s.label}</span>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
            color: 'var(--fg-faint)', background: 'var(--bg-3)',
            padding: '1px 6px', borderRadius: 3,
          }}>
            {CAT_LABEL[s.category] || s.category.toUpperCase()}
          </span>
          {s.metric_formatted && s.metric_formatted !== 'N/A' && (
            <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{s.metric_formatted}</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--fg-dim)', lineHeight: 1.5 }}>{s.reason}</div>
      </div>
      {/* Strength bar */}
      <div style={{ width: 60, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
        <div style={{ fontSize: 11, color: DIR_COLOR[s.direction] || 'var(--fg-faint)', fontWeight: 700 }}>
          {s.strength}/10
        </div>
        <div style={{ width: 50, height: 3, background: 'var(--hairline)', borderRadius: 2 }}>
          <div style={{
            width: `${s.strength * 10}%`, height: '100%',
            background: DIR_COLOR[s.direction] || 'var(--hairline-2)',
            borderRadius: 2,
          }} />
        </div>
      </div>
    </div>
  )
}

export default function SignalsTab({ data, signalReport }: Props) {
  // Prefer dedicated signal report; fall back to intelligence data
  const hasSR = signalReport && signalReport.signals.length > 0

  const bullPct = hasSR
    ? signalReport.composite_score
    : data.market_bias === 'Bullish' ? data.confidence_score
    : data.market_bias === 'Bearish' ? 100 - data.confidence_score
    : 50
  const bearPct = 100 - bullPct

  const direction = hasSR ? signalReport.composite_direction : data.market_bias.toLowerCase()
  const summary = hasSR ? signalReport.summary : ''
  const metrics = data.metrics || {}

  const allSignals: SignalItem[] = hasSR ? signalReport.signals : []
  const bullishSignals = allSignals.filter(s => s.direction === 'bullish')
  const bearishSignals = allSignals.filter(s => s.direction === 'bearish')
  const neutralSignals = allSignals.filter(s => s.direction === 'neutral')

  return (
    <div>
      {/* Composite Score Hero */}
      <div className="signals-hero">
        <div className="signal-meter">
          <div className="signal-meter-label">Bullish Score</div>
          <div className={`signal-meter-value ${bullPct > 55 ? 'bullish' : 'bearish'}`}>
            {bullPct.toFixed(0)}%
          </div>
          <div className="signal-meter-bar">
            <div className="signal-meter-fill-bull" style={{ width: `${bullPct}%` }} />
          </div>
        </div>

        <div style={{ textAlign: 'center', padding: '0 10px' }}>
          <div style={{ fontSize: 11, color: 'var(--fg-faint)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
            Composite
          </div>
          <span className={`signal-direction-badge ${direction === 'bullish' ? 'buy' : direction === 'bearish' ? 'sell' : 'neutral'}`}
            style={{ fontSize: 15, padding: '6px 14px' }}>
            {direction === 'bullish' ? '↑ Bullish' : direction === 'bearish' ? '↓ Bearish' : direction === 'mixed' ? '↔ Mixed' : '— Neutral'}
          </span>
          {summary && (
            <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 8, maxWidth: 220 }}>{summary}</div>
          )}
        </div>

        <div className="signal-meter">
          <div className="signal-meter-label">Bearish Score</div>
          <div className={`signal-meter-value ${bearPct > 55 ? 'bearish' : 'bullish'}`}>
            {bearPct.toFixed(0)}%
          </div>
          <div className="signal-meter-bar">
            <div className="signal-meter-fill-bear" style={{ width: `${bearPct}%` }} />
          </div>
        </div>
      </div>

      {/* Signal breakdown — only when real signal data available */}
      {hasSR && allSignals.length > 0 ? (
        <div style={{ marginTop: 20 }}>
          {bullishSignals.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div className="analytics-group-title" style={{ color: 'var(--pos)' }}>
                Bullish Signals ({bullishSignals.length})
              </div>
              {bullishSignals.map(s => <SignalRow key={s.key} s={s} />)}
            </div>
          )}
          {bearishSignals.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div className="analytics-group-title" style={{ color: 'var(--neg)' }}>
                Bearish Signals ({bearishSignals.length})
              </div>
              {bearishSignals.map(s => <SignalRow key={s.key} s={s} />)}
            </div>
          )}
          {neutralSignals.length > 0 && (
            <div>
              <div className="analytics-group-title">Neutral / Context ({neutralSignals.length})</div>
              {neutralSignals.map(s => <SignalRow key={s.key} s={s} />)}
            </div>
          )}
        </div>
      ) : (
        /* Fallback: intelligence bullets + metric table */
        <>
          <div className="intel-bullets" style={{ marginTop: 16 }}>
            <div className="intel-bullets-title">Intelligence Contributors</div>
            {data.interpretation_bullets.map((bullet, i) => (
              <div key={i} className="intel-bullet">
                <div className="intel-bullet-dot" />
                <span>{bullet}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 20 }}>
            <div className="analytics-group-title">Metric Breakdown</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--hairline)', color: 'var(--fg-faint)', fontSize: 11 }}>
                  <th style={{ textAlign: 'left', padding: '6px 0', letterSpacing: '0.08em' }}>METRIC</th>
                  <th style={{ textAlign: 'right', padding: '6px 0', letterSpacing: '0.08em' }}>VALUE</th>
                  <th style={{ textAlign: 'right', padding: '6px 0', letterSpacing: '0.08em' }}>SIGNAL</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(metrics).map((m) => (
                  <tr key={m.key} style={{ borderBottom: '1px solid var(--hairline)' }}>
                    <td style={{ padding: '7px 0', color: 'var(--fg-dim)' }}>{m.label}</td>
                    <td style={{ padding: '7px 0', textAlign: 'right', fontWeight: 600 }}>{m.formatted}</td>
                    <td style={{
                      padding: '7px 0', textAlign: 'right',
                      color: m.trend === 'up' ? 'var(--pos)' : m.trend === 'down' ? 'var(--neg)' : 'var(--fg-faint)',
                    }}>
                      {m.trend === 'up' ? '↑' : m.trend === 'down' ? '↓' : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
