import { useState } from 'react'
import './education.css'

interface Section {
  id: string
  title: string
  emoji: string
}

const SECTIONS: Section[] = [
  { id: 'intro',        title: 'What is Options Trading?',    emoji: '📖' },
  { id: 'oi',           title: 'Open Interest (OI)',          emoji: '📊' },
  { id: 'oi-tags',      title: 'OI Position Tags',            emoji: '🏷️' },
  { id: 'pcr',          title: 'Put-Call Ratio (PCR)',        emoji: '⚖️' },
  { id: 'iv',           title: 'Implied Volatility (IV)',     emoji: '🌊' },
  { id: 'greeks',       title: 'The Greeks',                  emoji: '🔢' },
  { id: 'gex',          title: 'Gamma Exposure (GEX)',        emoji: '⚡' },
  { id: 'levels',       title: 'Key Levels',                  emoji: '🏔️' },
  { id: 'signals',      title: 'OIE Signal Engine',           emoji: '🤖' },
  { id: 'positions',    title: 'Position Tracker',            emoji: '📍' },
  { id: 'platform',     title: 'Platform Overview',           emoji: '🚀' },
]

function Formula({ children }: { children: string }) {
  return (
    <div className="edu-formula">
      <code>{children}</code>
    </div>
  )
}

function Tag({ color, children }: { color: string; children: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      fontWeight: 700, fontSize: 11, letterSpacing: '0.06em',
      background: `${color}22`, border: `1px solid ${color}66`, color,
    }}>{children}</span>
  )
}

function Callout({ type, children }: { type: 'tip' | 'warn' | 'info'; children: React.ReactNode }) {
  const cfg = {
    tip:  { bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.3)',   icon: '✅', label: 'Key Point' },
    warn: { bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.3)',   icon: '⚠️', label: 'Warning' },
    info: { bg: 'rgba(96,165,250,0.08)',  border: 'rgba(96,165,250,0.3)',  icon: '💡', label: 'Note' },
  }[type]
  return (
    <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 6, padding: '10px 14px', margin: '12px 0' }}>
      <span style={{ fontWeight: 700, fontSize: 12, opacity: 0.9 }}>{cfg.icon} {cfg.label}: </span>
      <span style={{ fontSize: 13, lineHeight: 1.6 }}>{children}</span>
    </div>
  )
}

function SectionContent({ id }: { id: string }) {
  switch (id) {

    // ── Intro ─────────────────────────────────────────────────────────────────
    case 'intro': return (
      <div className="edu-body">
        <p>An <strong>option</strong> is a contract that gives the buyer the <em>right, but not the obligation</em>, to buy or sell an underlying asset at a fixed price (the <strong>strike price</strong>) on or before an <strong>expiry date</strong>.</p>

        <div className="edu-two-col">
          <div className="edu-card edu-card-green">
            <div className="edu-card-title">CALL Option (CE)</div>
            <div>Right to <strong>buy</strong> the underlying at the strike price.</div>
            <div className="edu-card-sub">Profits when the market goes UP</div>
            <Formula>Payoff = max(Spot − Strike, 0) − Premium</Formula>
          </div>
          <div className="edu-card edu-card-red">
            <div className="edu-card-title">PUT Option (PE)</div>
            <div>Right to <strong>sell</strong> the underlying at the strike price.</div>
            <div className="edu-card-sub">Profits when the market goes DOWN</div>
            <Formula>Payoff = max(Strike − Spot, 0) − Premium</Formula>
          </div>
        </div>

        <h3>Key Terminology</h3>
        <div className="edu-table-wrap">
          <table className="edu-table">
            <thead><tr><th>Term</th><th>Definition</th><th>Example (NIFTY)</th></tr></thead>
            <tbody>
              <tr><td><strong>Spot Price</strong></td><td>Current market price of the underlying index/stock</td><td>₹24,133</td></tr>
              <tr><td><strong>Strike Price</strong></td><td>Fixed price at which the option can be exercised</td><td>24,200 CE</td></tr>
              <tr><td><strong>Premium (LTP)</strong></td><td>Price you pay to buy the option contract</td><td>₹84.7</td></tr>
              <tr><td><strong>Expiry</strong></td><td>Date after which the option expires worthless</td><td>26-Jun-2026</td></tr>
              <tr><td><strong>Lot Size</strong></td><td>Number of shares per option contract</td><td>65 (NIFTY)</td></tr>
              <tr><td><strong>ITM</strong></td><td>In-The-Money — CE: Spot &gt; Strike; PE: Spot &lt; Strike</td><td>24000 CE when spot = 24133</td></tr>
              <tr><td><strong>ATM</strong></td><td>At-The-Money — Strike ≈ Spot</td><td>24150 CE when spot = 24133</td></tr>
              <tr><td><strong>OTM</strong></td><td>Out-of-The-Money — CE: Spot &lt; Strike; PE: Spot &gt; Strike</td><td>24500 CE when spot = 24133</td></tr>
            </tbody>
          </table>
        </div>

        <Callout type="tip">Options are a leveraged instrument. Buying a NIFTY lot costs ≈ ₹5,500 in premium but controls ≈ ₹15.7 lakh of underlying exposure (65 × ₹24,133).</Callout>
      </div>
    )

    // ── OI ───────────────────────────────────────────────────────────────────
    case 'oi': return (
      <div className="edu-body">
        <p><strong>Open Interest (OI)</strong> is the total number of outstanding (open) option contracts that have not been settled or closed. It measures <em>money flow and commitment</em> — not just volume.</p>

        <Formula>OI Change = Today's OI − Yesterday's OI</Formula>

        <div className="edu-two-col">
          <div className="edu-card">
            <div className="edu-card-title">OI ≠ Volume</div>
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
              <li><strong>Volume</strong>: total contracts traded today (resets to 0 each day)</li>
              <li><strong>OI</strong>: total contracts still open (accumulates over time)</li>
            </ul>
          </div>
          <div className="edu-card">
            <div className="edu-card-title">Why OI Matters</div>
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
              <li>High OI at a strike = strong support/resistance</li>
              <li>Rising OI = new money entering the market</li>
              <li>Falling OI = positions being closed/squared off</li>
            </ul>
          </div>
        </div>

        <h3>Reading the Chain</h3>
        <p>In the <strong>Chain tab</strong>, the OI bar in each row is proportional to the maximum OI on that side — so thicker bars = larger open interest at that strike.</p>
        <Callout type="info">The strike with the highest CE OI is typically the <strong>Call Wall</strong> (resistance). The strike with the highest PE OI is the <strong>Put Wall</strong> (support). Market makers defend these levels actively.</Callout>

        <h3>How the platform shows it</h3>
        <div className="edu-platform-ref">
          <span className="edu-platform-badge">Chain Tab</span>
          OI column with gradient bar · ΔOI column with colour (green = rising, red = falling)
        </div>
      </div>
    )

    // ── OI Tags ───────────────────────────────────────────────────────────────
    case 'oi-tags': return (
      <div className="edu-body">
        <p>OI change alone doesn't tell you <em>who</em> is entering — buyers or writers. Combined with price direction, we can classify each move into one of four patterns:</p>

        <div className="edu-four-grid">
          <div className="edu-tag-card" style={{ borderColor: 'rgba(34,197,94,0.5)' }}>
            <Tag color="rgb(34,197,94)">LB</Tag>
            <div className="edu-tag-name">Long Buildup</div>
            <Formula>OI ↑  +  Price ↑</Formula>
            <div className="edu-tag-desc">New buyers entering. Bullish signal — smart money accumulating.</div>
          </div>
          <div className="edu-tag-card" style={{ borderColor: 'rgba(239,68,68,0.5)' }}>
            <Tag color="rgb(239,68,68)">SB</Tag>
            <div className="edu-tag-name">Short Buildup</div>
            <Formula>OI ↑  +  Price ↓</Formula>
            <div className="edu-tag-desc">New writers/sellers entering. Bearish signal — shorts increasing.</div>
          </div>
          <div className="edu-tag-card" style={{ borderColor: 'rgba(251,191,36,0.5)' }}>
            <Tag color="rgb(251,191,36)">SC</Tag>
            <div className="edu-tag-name">Short Covering</div>
            <Formula>OI ↓  +  Price ↑</Formula>
            <div className="edu-tag-desc">Short sellers buying back to exit. Can cause sharp rallies.</div>
          </div>
          <div className="edu-tag-card" style={{ borderColor: 'rgba(148,163,184,0.5)' }}>
            <Tag color="rgb(148,163,184)">LU</Tag>
            <div className="edu-tag-name">Long Unwinding</div>
            <Formula>OI ↓  +  Price ↓</Formula>
            <div className="edu-tag-desc">Buyers closing long positions. Weakness signal.</div>
          </div>
        </div>

        <h3>Interpretation in context</h3>
        <div className="edu-table-wrap">
          <table className="edu-table">
            <thead><tr><th>Strike</th><th>CE OI Tag</th><th>PE OI Tag</th><th>What it tells us</th></tr></thead>
            <tbody>
              <tr><td>ATM</td><td><Tag color="rgb(34,197,94)">LB</Tag></td><td><Tag color="rgb(239,68,68)">SB</Tag></td><td>Bulls buying ATM CE; put writers building — strongly bullish</td></tr>
              <tr><td>24,500 OTM</td><td><Tag color="rgb(239,68,68)">SB</Tag></td><td>—</td><td>Writers selling OTM CE — expect resistance at 24,500</td></tr>
              <tr><td>24,000 OTM</td><td>—</td><td><Tag color="rgb(239,68,68)">SB</Tag></td><td>Writers selling OTM PE — expect support at 24,000</td></tr>
              <tr><td>ATM</td><td><Tag color="rgb(148,163,184)">LU</Tag></td><td><Tag color="rgb(251,191,36)">SC</Tag></td><td>Bulls exiting CE + PE writers covering — bearish reversal warning</td></tr>
            </tbody>
          </table>
        </div>
        <Callout type="warn">In the Position Tracker, when OI shows <strong>LU on your CE long</strong>, the engine flags it as WATCH — institutional longs are reducing, which precedes price drops.</Callout>
      </div>
    )

    // ── PCR ───────────────────────────────────────────────────────────────────
    case 'pcr': return (
      <div className="edu-body">
        <Formula>PCR = Total PE Open Interest / Total CE Open Interest</Formula>

        <div className="edu-two-col">
          <div className="edu-card edu-card-green">
            <div className="edu-card-title">PCR &gt; 1.2 (High)</div>
            Excessive put buying or call selling. Market is oversold / fear elevated.
            <div className="edu-card-sub">Contrarian: often a buy signal — market likely to bounce</div>
          </div>
          <div className="edu-card edu-card-red">
            <div className="edu-card-title">PCR &lt; 0.7 (Low)</div>
            Excessive call buying or put selling. Market is overbought / greed elevated.
            <div className="edu-card-sub">Contrarian: often a sell signal — market likely to correct</div>
          </div>
        </div>

        <h3>PCR ranges</h3>
        <div className="edu-table-wrap">
          <table className="edu-table">
            <thead><tr><th>PCR Range</th><th>Sentiment</th><th>Typical market behaviour</th></tr></thead>
            <tbody>
              <tr><td>&gt; 1.5</td><td>Extreme fear</td><td>Strong bounce likely</td></tr>
              <tr><td>1.2 – 1.5</td><td>Bearish</td><td>Mild bounce possible</td></tr>
              <tr><td>0.8 – 1.2</td><td>Neutral</td><td>Trending / range-bound</td></tr>
              <tr><td>0.5 – 0.8</td><td>Bullish</td><td>Mild correction possible</td></tr>
              <tr><td>&lt; 0.5</td><td>Extreme greed</td><td>Correction likely</td></tr>
            </tbody>
          </table>
        </div>
        <Callout type="info">PCR is a <em>sentiment</em> indicator, not a timing signal. High PCR + rising spot = smart money selling puts = structural support. Always use with OI data.</Callout>
        <div className="edu-platform-ref">
          <span className="edu-platform-badge">Chain Tab</span>
          PCR shown in the stats bar at the top of the chain view
        </div>
      </div>
    )

    // ── IV ────────────────────────────────────────────────────────────────────
    case 'iv': return (
      <div className="edu-body">
        <p><strong>Implied Volatility (IV)</strong> is the market's forward-looking expectation of how much the underlying will move, extracted from the current option premium using the Black-Scholes model.</p>

        <Formula>IV = σ such that BS(Spot, Strike, T, r, σ) = Market Premium</Formula>

        <div className="edu-two-col">
          <div className="edu-card edu-card-green">
            <div className="edu-card-title">IV rising</div>
            Premium gets more expensive. Buyers pay more. Usually happens before events (results, budget, elections). Good time to <strong>SELL</strong> options.
          </div>
          <div className="edu-card edu-card-red">
            <div className="edu-card-title">IV falling (IV Crush)</div>
            Premium collapses after an event. Long option buyers lose even if direction is right. Called <strong>IV crush</strong> — most dangerous for buyers post-event.
          </div>
        </div>

        <h3>IV Skew</h3>
        <p>Typically PE IV &gt; CE IV because market participants pay more for downside protection. This creates an IV skew — OTM puts are more expensive than equivalent OTM calls.</p>
        <Formula>Skew = IV(OTM Put) − IV(OTM Call)</Formula>

        <h3>Annualised IV to Daily Move</h3>
        <Formula>Expected Daily Move = Spot × IV / √252</Formula>
        <p>Example: NIFTY at 24,133, IV = 14% → Expected daily move = 24133 × 0.14 / 15.87 = <strong>±213 points</strong></p>

        <Callout type="tip">The IV% column in the Chain tab shows per-strike IV. Rising IV across strikes = fear. Rising PE IV specifically = hedging demand.</Callout>
        <div className="edu-platform-ref">
          <span className="edu-platform-badge">Chain Tab</span>
          IV% column for each strike · IV Skew panel in Positioning
        </div>
      </div>
    )

    // ── Greeks ────────────────────────────────────────────────────────────────
    case 'greeks': return (
      <div className="edu-body">
        <p>The Greeks measure how an option's premium changes with respect to market variables. They are partial derivatives of the Black-Scholes pricing model.</p>

        {/* Delta */}
        <div className="edu-greek-block">
          <div className="edu-greek-header">
            <span className="edu-greek-symbol">Δ</span>
            <span className="edu-greek-name">Delta</span>
            <span className="edu-greek-tagline">How much does premium move per ₹1 move in Spot?</span>
          </div>
          <Formula>Δ = ∂V / ∂S</Formula>
          <div className="edu-two-col">
            <div>
              <strong>CE Delta</strong>: 0 to +1<br/>
              ATM CE ≈ 0.50 · Deep ITM ≈ 0.90 · Deep OTM ≈ 0.05
            </div>
            <div>
              <strong>PE Delta</strong>: −1 to 0<br/>
              ATM PE ≈ −0.50 · Deep ITM ≈ −0.90 · Deep OTM ≈ −0.05
            </div>
          </div>
          <Callout type="info">Delta also approximates the <strong>probability of expiring ITM</strong>. CE Delta 0.30 → ~30% chance of expiring above strike.</Callout>
          <div className="edu-platform-ref">
            <span className="edu-platform-badge">Position Tracker</span>
            Delta drives the trailing SL formula. Δ ≥ 0.60 → lock 75% of gain. Δ &lt; 0.15 → EXIT_NOW (option dying).
          </div>
        </div>

        {/* Gamma */}
        <div className="edu-greek-block">
          <div className="edu-greek-header">
            <span className="edu-greek-symbol">Γ</span>
            <span className="edu-greek-name">Gamma</span>
            <span className="edu-greek-tagline">Rate of change of Delta per ₹1 move in Spot</span>
          </div>
          <Formula>Γ = ∂Δ / ∂S = ∂²V / ∂S²</Formula>
          <ul style={{ lineHeight: 1.9 }}>
            <li>Gamma is <strong>highest at ATM</strong> and near expiry — small spot moves create large delta shifts</li>
            <li>Long options have <strong>positive gamma</strong> (accelerating profits, decelerating losses)</li>
            <li>Short options have <strong>negative gamma</strong> (dangerous near ATM near expiry)</li>
            <li>Gamma risk is why we apply the <strong>21-DTE rule</strong> for selling strategies</li>
          </ul>
          <Callout type="warn">High gamma near expiry = explosive moves. A short CE writer near ATM on expiry day faces unlimited loss if spot breaks out.</Callout>
          <div className="edu-platform-ref">
            <span className="edu-platform-badge">Chain Tab</span>
            Γ column in Greeks view · GEX profile chart uses gamma × OI
          </div>
        </div>

        {/* Theta */}
        <div className="edu-greek-block">
          <div className="edu-greek-header">
            <span className="edu-greek-symbol">θ</span>
            <span className="edu-greek-name">Theta</span>
            <span className="edu-greek-tagline">Daily time decay of the option premium</span>
          </div>
          <Formula>θ = ∂V / ∂t  (typically expressed as ₹ lost per day)</Formula>
          <div className="edu-two-col">
            <div className="edu-card edu-card-red">
              <div className="edu-card-title">For Option Buyers</div>
              Theta is the <strong>enemy</strong>. Each day you hold a long option, theta erodes your premium even if spot doesn't move.
              <Formula>θ/LTP ratio = Daily decay as % of premium</Formula>
              <div className="edu-card-sub">&gt;2%/day = dangerously fast. Exit or roll.</div>
            </div>
            <div className="edu-card edu-card-green">
              <div className="edu-card-title">For Option Sellers</div>
              Theta is your <strong>income</strong>. Time works for you — premium decays into your pocket daily if spot stays range-bound.
              <div className="edu-card-sub">This is why selling OTM options in a calm market is profitable.</div>
            </div>
          </div>
          <Callout type="tip">Theta accelerates non-linearly — it roughly doubles in the last 30 days and again in the last 7 days. This is the core reason for the 5-DTE warning in the position tracker.</Callout>
          <div className="edu-platform-ref">
            <span className="edu-platform-badge">Position Tracker</span>
            θ/LTP &gt; 2%/day → WATCH even if direction is aligned. Shown as "θ 2.1%/day" in advice text.
          </div>
        </div>

        {/* Vega */}
        <div className="edu-greek-block">
          <div className="edu-greek-header">
            <span className="edu-greek-symbol">ν</span>
            <span className="edu-greek-name">Vega</span>
            <span className="edu-greek-tagline">Change in premium for 1% change in IV</span>
          </div>
          <Formula>ν = ∂V / ∂σ</Formula>
          <ul style={{ lineHeight: 1.9 }}>
            <li>Vega is highest for <strong>ATM options with longer DTE</strong></li>
            <li>If you buy before an event (high IV) and IV collapses after → vega loss can wipe profits even if direction is correct</li>
            <li>Sellers benefit from falling IV (vega works in their favour)</li>
          </ul>
          <Callout type="warn">IV crush example: NIFTY result day. IV at 25% before, collapses to 14% after. A CE buyer with vega = 0.30 loses ₹0.30 × 11% × 100 = ₹330/lot from IV crush alone.</Callout>
        </div>
      </div>
    )

    // ── GEX ───────────────────────────────────────────────────────────────────
    case 'gex': return (
      <div className="edu-body">
        <p><strong>Gamma Exposure (GEX)</strong> measures the aggregate gamma of all outstanding options, weighted by their OI and lot size. It captures how much dealers (market makers) need to hedge for each ₹1 move in spot.</p>

        <Formula>GEX = Σ (Gamma × OI × Lot Size × Spot²) / 100</Formula>
        <p style={{ fontSize: 12, color: 'var(--fg-faint)' }}>Summed across all strikes and both CE and PE sides (CE adds to GEX, PE subtracts)</p>

        <div className="edu-two-col">
          <div className="edu-card edu-card-green">
            <div className="edu-card-title">+GEX (Positive Gamma)</div>
            Dealers are <strong>long gamma</strong>. They buy on dips and sell on rallies to hedge. This <strong>dampens volatility</strong> and creates a magnetic pull back to the gamma flip level. Markets tend to be stable and mean-reverting.
          </div>
          <div className="edu-card edu-card-red">
            <div className="edu-card-title">−GEX (Negative Gamma)</div>
            Dealers are <strong>short gamma</strong>. They must sell when spot falls and buy when spot rises to hedge. This <strong>amplifies volatility</strong> — moves accelerate once triggered. Breakouts and crashes happen in negative GEX regimes.
          </div>
        </div>

        <h3>Gamma Flip Level</h3>
        <p>The <strong>gamma flip</strong> is the spot price where total GEX crosses zero — from positive to negative territory.</p>
        <Formula>Spot &gt; Gamma Flip → +GEX → Dealers suppress volatility (range-bound)</Formula>
        <Formula>Spot &lt; Gamma Flip → −GEX → Dealers amplify volatility (trending/crash risk)</Formula>

        <Callout type="tip">The gamma flip is one of the most powerful structural levels in the market. In the OIE engine, crossing below it for CE longs triggers an immediate EXIT_NOW signal.</Callout>

        <div className="edu-platform-ref">
          <span className="edu-platform-badge">Chain Tab</span>
          GEX profile chart — blue bars = positive GEX (support), red bars = negative (resistance) · Purple dashed line = gamma flip
        </div>
      </div>
    )

    // ── Key Levels ────────────────────────────────────────────────────────────
    case 'levels': return (
      <div className="edu-body">
        <div className="edu-four-grid">
          <div className="edu-tag-card" style={{ borderColor: 'rgba(120,201,255,0.4)' }}>
            <div className="edu-card-title" style={{ color: 'rgb(120,201,255)' }}>Call Wall</div>
            <Formula>Strike with Max CE OI</Formula>
            <div className="edu-tag-desc">Dealers short massive gamma here. Strong resistance — if spot approaches, expect selling. CE shorts add here; CE longs book here.</div>
          </div>
          <div className="edu-tag-card" style={{ borderColor: 'rgba(241,66,66,0.4)' }}>
            <div className="edu-card-title" style={{ color: 'rgb(241,66,66)' }}>Put Wall</div>
            <Formula>Strike with Max PE OI</Formula>
            <div className="edu-tag-desc">Dealers short puts here — they buy the underlying to hedge. Strong support floor. PE shorts add here; PE longs book here.</div>
          </div>
          <div className="edu-tag-card" style={{ borderColor: 'rgba(167,139,250,0.4)' }}>
            <div className="edu-card-title" style={{ color: 'rgb(167,139,250)' }}>Gamma Flip</div>
            <Formula>GEX = 0 crossover strike</Formula>
            <div className="edu-tag-desc">Structural regime change. Above = stable. Below = volatile. Most important structural level for intraday traders.</div>
          </div>
          <div className="edu-tag-card" style={{ borderColor: 'rgba(251,191,36,0.4)' }}>
            <div className="edu-card-title" style={{ color: 'rgb(251,191,36)' }}>Max Pain</div>
            <Formula>Strike that minimises total option value at expiry</Formula>
            <div className="edu-tag-desc">The price where option writers collectively lose the least. Markets often gravitate toward max pain on expiry day.</div>
          </div>
        </div>

        <h3>Straddle Price</h3>
        <Formula>Straddle = ATM CE LTP + ATM PE LTP</Formula>
        <p>The straddle price represents the <strong>expected move</strong> the market is pricing in for the expiry. If straddle = ₹150 and spot = 24,133 → market expects spot to stay between 23,983 and 24,283.</p>

        <Callout type="info">These four levels together define the <em>battleground</em> — Put Wall below (support), Call Wall above (resistance), Gamma Flip as the pivot, Max Pain as expiry gravity.</Callout>
        <div className="edu-platform-ref">
          <span className="edu-platform-badge">Chain Tab</span>
          Stats bar at top shows all four levels · Call Wall rows highlighted in blue · Put Wall rows in red
        </div>
      </div>
    )

    // ── Signals ───────────────────────────────────────────────────────────────
    case 'signals': return (
      <div className="edu-body">
        <p>The <strong>Options Intelligence Engine (OIE)</strong> synthesizes all the data above into a single composite signal every 30 seconds. Here's what it processes:</p>

        <div className="edu-pipeline">
          {[
            ['1', 'Fetch Chain', 'Live option chain from Nubra API — OI, LTP, Greeks for all strikes'],
            ['2', 'Build OIE Chain', 'Compute GEX per strike, aggregate call/put walls, gamma flip'],
            ['3', 'Run Analytics', 'PCR, IV skew, straddle, OI buildup patterns, IV history'],
            ['4', 'Intelligence Engine', 'Synthesize market bias, confidence score, key levels'],
            ['5', 'Signal Engine', 'Composite direction (bullish/bearish/conflicted), composite score'],
            ['6', 'Fire Alerts', 'Push alerts when signal changes or thresholds are crossed'],
          ].map(([n, title, desc]) => (
            <div className="edu-pipeline-step" key={n}>
              <div className="edu-pipeline-num">{n}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{title}</div>
                <div style={{ fontSize: 12, color: 'var(--fg-faint)', marginTop: 2 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        <h3>Composite Direction &amp; Score</h3>
        <Formula>Composite Score = weighted_avg(PCR signal, GEX regime, OI flow, IV skew, key level proximity)</Formula>
        <div className="edu-table-wrap">
          <table className="edu-table">
            <thead><tr><th>Direction</th><th>Score</th><th>Meaning</th></tr></thead>
            <tbody>
              <tr><td><span style={{ color: 'var(--pos)', fontWeight: 700 }}>BULLISH</span></td><td>&gt; 60%</td><td>Multiple inputs aligned for upside — BUY CE / SELL PE</td></tr>
              <tr><td><span style={{ color: 'var(--neg)', fontWeight: 700 }}>BEARISH</span></td><td>&gt; 60%</td><td>Multiple inputs aligned for downside — BUY PE / SELL CE</td></tr>
              <tr><td><span style={{ color: 'var(--fg-faint)', fontWeight: 700 }}>CONFLICTED</span></td><td>40–60%</td><td>Mixed signals — reduce size, tighten stops</td></tr>
            </tbody>
          </table>
        </div>

        <h3>Trade Suggestions (⚡ Signals)</h3>
        <p>When Signals are enabled in the Chain tab, each strike shows a computed entry suggestion:</p>
        <div className="edu-two-col">
          <div className="edu-card edu-card-green">
            <div className="edu-card-title">BUY signal criteria</div>
            Direction aligned + OI shows LB/SC on that strike + above gamma flip + score ≥ 52%
            <Formula>SL = Entry × 0.70  |  Target = Entry × 1.60</Formula>
          </div>
          <div className="edu-card" style={{ borderColor: 'rgba(251,146,60,0.3)' }}>
            <div className="edu-card-title" style={{ color: 'rgb(251,146,60)' }}>SELL signal criteria</div>
            Direction counter to option type + OI shows SB + near wall + score ≥ 52%
            <Formula>SL = Entry × 1.50  |  Target = Entry × 0.30</Formula>
          </div>
        </div>
      </div>
    )

    // ── Positions ─────────────────────────────────────────────────────────────
    case 'positions': return (
      <div className="edu-body">
        <p>The <strong>Position Tracker</strong> uses live Greeks from the chain to give you real-time, context-aware advice on every open position — not just a static SL/Target.</p>

        <h3>What it monitors</h3>
        <div className="edu-four-grid">
          <div className="edu-tag-card">
            <div className="edu-card-title">Delta (Δ)</div>
            <div className="edu-tag-desc">Position sensitivity. Δ &lt; 0.15 + in loss = EXIT_NOW (option dying). Δ drives trailing SL %.</div>
          </div>
          <div className="edu-tag-card">
            <div className="edu-card-title">Theta (θ/P)</div>
            <div className="edu-tag-desc">Daily decay rate. &gt;2%/day of premium = WATCH even if direction is correct.</div>
          </div>
          <div className="edu-tag-card">
            <div className="edu-card-title">OI Flow</div>
            <div className="edu-tag-desc">Long Unwinding on your strike = institutional longs reducing. WATCH signal.</div>
          </div>
          <div className="edu-tag-card">
            <div className="edu-card-title">Key Levels</div>
            <div className="edu-tag-desc">Gamma flip crossed against position = EXIT_NOW. Near call/put wall = BOOK_PARTIAL.</div>
          </div>
        </div>

        <h3>Advice States</h3>
        <div className="edu-table-wrap">
          <table className="edu-table">
            <thead><tr><th>State</th><th>Trigger</th><th>Action</th></tr></thead>
            <tbody>
              <tr><td><Tag color="rgb(239,68,68)">EXIT NOW</Tag></td><td>SL hit, delta collapsed, direction flipped, gamma flip crossed</td><td>Close immediately — no exceptions</td></tr>
              <tr><td><Tag color="rgb(239,68,68)">COVER NOW</Tag></td><td>Same but for SELL positions</td><td>Buy back immediately</td></tr>
              <tr><td><Tag color="rgb(251,146,60)">BOOK ½</Tag></td><td>Target reached, near call/put wall, inside 21 DTE for shorts</td><td>Close 50%, trail rest with tighter SL</td></tr>
              <tr><td><Tag color="rgb(96,165,250)">TRAIL SL</Tag></td><td>Profit ≥15%, delta-based trail significantly better than current SL</td><td>Move SL to lock in gains</td></tr>
              <tr><td><Tag color="rgb(251,191,36)">WATCH</Tag></td><td>Signals conflicted, θ&gt;2%/day, DTE≤5, OI unwinding</td><td>Tighten SL, reduce size, monitor closely</td></tr>
              <tr><td><Tag color="rgb(148,163,184)">HOLD</Tag></td><td>All conditions aligned, no immediate risk</td><td>Hold — no action needed</td></tr>
            </tbody>
          </table>
        </div>

        <h3>Fast LTP Stream</h3>
        <p>A dedicated <strong>2-second WebSocket</strong> (<code>/ws/oie-ltp</code>) polls the orderbook for only the strikes you're tracking — so your P&L updates every 2 seconds vs the 30-second full analytics refresh.</p>
        <Callout type="tip">The "If holding → SL ₹X" suggestion only appears when the recommended SL is ≥5% better than your current SL. No noise, no constant flickering.</Callout>
      </div>
    )

    // ── Platform ──────────────────────────────────────────────────────────────
    case 'platform': return (
      <div className="edu-body">
        <p>Here's a complete map of every module in NubraOSS and what it does:</p>

        <div className="edu-table-wrap">
          <table className="edu-table">
            <thead><tr><th>Module</th><th>What it does</th><th>Key tech</th></tr></thead>
            <tbody>
              <tr><td><strong>Dashboard</strong></td><td>Market overview, quick access to all tools</td><td>Metric tiles, live tables</td></tr>
              <tr><td><strong>Positioning</strong></td><td>Intraday positioning terminal — OI walls, PCR panel, IV skew, market internals, sector rotation, breadth</td><td>Fast chart loading, multi-panel layout</td></tr>
              <tr><td><strong>Options Intelligence</strong></td><td>Full OIE pipeline — 8 tabs: Intelligence, Analytics, Signals, Chain (GEX + OI tags), Positions (Greek-aware tracker), Strategy, Alerts, Automation</td><td>30s WebSocket + 2s fast LTP stream</td></tr>
              <tr><td><strong>Scanner</strong></td><td>Volume breakout scanner with gap-fill detection and live OI filtering</td><td>Batch WebSocket, real-time OI data</td></tr>
              <tr><td><strong>Webhook</strong></td><td>TradingView webhook integration — receive alerts and execute orders automatically</td><td>FastAPI webhook endpoint, order routing</td></tr>
              <tr><td><strong>Scalper</strong></td><td>Straddle/strangle scalper with delta-neutral positioning, live P&L charts, volume breakout overlay</td><td>Live chart WebSocket, CE+PE pair tracking</td></tr>
              <tr><td><strong>Range Trader</strong></td><td>Range-based strategy with automated entry/exit, OI-filtered setups, live position management</td><td>Range detection, quote stream</td></tr>
            </tbody>
          </table>
        </div>

        <h3>Technical Architecture</h3>
        <div className="edu-pipeline">
          {[
            ['Frontend', 'React + TypeScript + Vite — no external charting libs, all custom SVG charts'],
            ['Backend', 'FastAPI (Python) — WebSocket endpoints, REST APIs, background services'],
            ['Data', 'Nubra Broker API — live option chain, orderbook, order execution'],
            ['Storage', 'SQLite — OI snapshots, IV history, signal history for analytics'],
            ['Positions', 'localStorage — tracked positions with real-time Greek-aware advice'],
          ].map(([layer, desc]) => (
            <div className="edu-pipeline-step" key={layer}>
              <div className="edu-pipeline-num" style={{ minWidth: 100, borderRadius: 4, fontSize: 11 }}>{layer}</div>
              <div style={{ fontSize: 13, color: 'var(--fg-faint)' }}>{desc}</div>
            </div>
          ))}
        </div>

        <Callout type="tip">All tools are login-gated using Nubra session tokens. Demo mode is available — real execution requires MPIN authentication.</Callout>
      </div>
    )

    default: return null
  }
}

interface Props {
  onClose: () => void
}

export default function EducationPage({ onClose }: Props) {
  const [activeSection, setActiveSection] = useState('intro')
  const currentIdx = SECTIONS.findIndex(s => s.id === activeSection)

  function goNext() {
    if (currentIdx < SECTIONS.length - 1) setActiveSection(SECTIONS[currentIdx + 1].id)
  }
  function goPrev() {
    if (currentIdx > 0) setActiveSection(SECTIONS[currentIdx - 1].id)
  }

  const current = SECTIONS[currentIdx]

  return (
    <div className="edu-root">
      {/* Header */}
      <div className="edu-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 18 }}>📚</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Options Intelligence — Educational Guide</div>
            <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 1 }}>
              {currentIdx + 1} of {SECTIONS.length} sections
            </div>
          </div>
        </div>
        <button className="edu-close" onClick={onClose}>✕ Close</button>
      </div>

      <div className="edu-layout">
        {/* Sidebar */}
        <nav className="edu-sidebar">
          {SECTIONS.map((s, i) => (
            <button
              key={s.id}
              className={`edu-nav-item${activeSection === s.id ? ' active' : ''}`}
              onClick={() => setActiveSection(s.id)}
            >
              <span className="edu-nav-num">{i + 1}</span>
              <span className="edu-nav-emoji">{s.emoji}</span>
              <span className="edu-nav-label">{s.title}</span>
            </button>
          ))}
        </nav>

        {/* Content */}
        <main className="edu-main">
          <div className="edu-section-header">
            <span style={{ fontSize: 28 }}>{current.emoji}</span>
            <h2 className="edu-section-title">{current.title}</h2>
          </div>
          <SectionContent id={activeSection} />
        </main>
      </div>

      {/* Footer nav */}
      <div className="edu-footer">
        <button
          className="btn-ghost"
          onClick={goPrev}
          disabled={currentIdx === 0}
        >
          ← Previous
        </button>
        <div style={{ display: 'flex', gap: 6 }}>
          {SECTIONS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              style={{
                width: 8, height: 8, borderRadius: '50%', border: 'none',
                background: i === currentIdx ? 'var(--accent)' : 'var(--hairline)',
                cursor: 'pointer', padding: 0, transition: 'background .2s',
              }}
            />
          ))}
        </div>
        <button
          className={currentIdx === SECTIONS.length - 1 ? 'btn-primary' : 'btn-ghost'}
          onClick={currentIdx === SECTIONS.length - 1 ? onClose : goNext}
        >
          {currentIdx === SECTIONS.length - 1 ? '🚀 Enter Dashboard' : 'Next →'}
        </button>
      </div>
    </div>
  )
}
