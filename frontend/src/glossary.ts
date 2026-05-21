export interface GlossaryEntry {
  label: string
  body: string
  example?: string
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  sentiment: {
    label: 'Market Sentiment',
    body: 'A composite score that combines breadth, options flow, smart money signals, and price structure to gauge whether the overall market feels bullish or bearish right now. Think of it as the market\'s mood reading.',
    example: 'Score 72 = "Most indicators are pointing bullish — conditions favour long setups."',
  },
  regime: {
    label: 'Market Regime',
    body: 'The current "mode" of the market: trending up, trending down, choppy (rangebound), or volatile. This is the single most important context — strategies that work well in a trending regime can fail badly in chop.',
    example: '"Volatile chop" means the market is swinging wildly but going nowhere. "Trend up" means momentum is strong and persistent.',
  },
  breadth: {
    label: 'Market Breadth',
    body: 'How many stocks are rising vs falling right now. Strong breadth means the rally or sell-off is broad-based — not just a few large-cap names pulling the index. Weak breadth (index up, but most stocks flat or down) often signals a fragile, unsustainable move.',
    example: 'If NIFTY is +0.8% but only 120 of 500 stocks are advancing, breadth is weak — the index is being dragged up by a handful of heavyweights.',
  },
  options_bias: {
    label: 'Options Bias',
    body: 'Whether call buyers (bullish bets) or put buyers (bearish bets) are dominating options activity across the market. This is a proxy for where institutional traders are placing directional bets.',
    example: 'Score 68 with "bullish" direction = more money flowing into calls than puts — options traders are positioned for upside.',
  },
  smart_money: {
    label: 'Smart Money',
    body: 'Signals suggesting institutional traders (large funds, banks, FIIs) may be accumulating or distributing. We look at unusual block trades, OI buildup, and price-volume divergences as proxies — this is an indicator, not direct visibility into fund activity.',
    example: 'A stock quietly absorbing large sell orders without the price falling is a classic institutional accumulation sign.',
  },
  control_state: {
    label: 'Control State',
    body: 'Who is in control of price action: buyers, sellers, or neither. "Rotational balance" means the market is in equilibrium — both sides are evenly matched and price is likely to stay rangebound until a catalyst tips the balance.',
    example: '"Bull control" = buyers are consistently absorbing sells. "Rotational balance" = no clear winner yet, avoid directional bias.',
  },
  market_internals: {
    label: 'Market Internals',
    body: 'A composite view of participation quality — how many stocks are above their open, whether sector breadth is expanding or contracting, and whether volume is confirming the index move. Good internals validate a price move; poor internals warn of a false or exhausted move.',
    example: 'Index +0.5% with 70% of stocks above their open = solid internals. Index +0.5% with only 35% above open = warning sign.',
  },
  volatility: {
    label: 'Volatility Context',
    body: 'Whether the market\'s current price swings are directional (trending with purpose), contained (moving in a defined range), or choppy (large swings with no net progress). Directional volatility is tradeable; chop volatility is expensive.',
    example: '"Directional" = each swing extends the trend. "Volatile chop" = big moves that reverse quickly, making most entries wrong.',
  },
  sector_rotation: {
    label: 'Sector Rotation',
    body: 'How money flows between industry groups (sectors) during the day. When institutional money rotates out of IT into Pharma, for example, it tells you which sectors have tailwinds right now. Leadership shifts fast intraday — this map shows who is leading.',
    example: 'When IT cools and FMCG picks up, money is rotating to defensives — often a sign of risk-off sentiment in the broader market.',
  },
  options_pressure: {
    label: 'Options Pressure',
    body: 'Whether call buyers or put buyers are dominating options activity for a specific instrument. Heavy call buying suggests traders are positioned for a move up; heavy put buying suggests they expect a move down. These are bets placed by real market participants.',
    example: 'Call pressure 72, Put pressure 28 → options traders are strongly bullish on this instrument today.',
  },
  vwap: {
    label: 'VWAP',
    body: 'Volume-Weighted Average Price — the average price of a stock adjusted for how much volume was traded at each price level. Institutions use VWAP as an execution benchmark. Price above VWAP generally means buyers are in control intraday; below VWAP means sellers are.',
    example: 'A stock that dipped to VWAP and bounced is showing "VWAP support" — a common institutional entry trigger used by large funds.',
  },
  opening_range: {
    label: 'Opening Range',
    body: 'The high and low formed during the first 15–30 minutes of the trading session. A break above the opening range high is bullish; a break below the low is bearish. Many intraday systems treat this as the primary directional trigger for the day.',
    example: 'Stock chops between ₹100–102 in first 20 min, then breaks above ₹102 on heavy volume → opening range breakout, directional signal to the upside.',
  },
  momentum: {
    label: 'Momentum',
    body: 'The strength and persistence of a price move, measured by the day\'s percentage change combined with volume expansion. Strong momentum means a large move backed by high volume — buyers (or sellers) are confident and committed.',
    example: '+1.8% move with 2.4x normal volume = strong bullish momentum. +0.5% on light volume = weak, likely to fade.',
  },
  quality_score: {
    label: 'Setup Quality Score',
    body: 'A composite score (0–100) rating how well a stock\'s current setup aligns with ideal breakout criteria: volume expansion, price momentum, key level breaks (VWAP, opening range), and sector tailwinds. The higher the score, the more factors are aligned.',
    example: 'Score 82 = strong volume, bullish sector, price above VWAP, and opening range confirmed. Score 40 = one or two criteria met, setup is incomplete.',
  },
  volume_ratio: {
    label: 'Volume Ratio',
    body: 'Today\'s traded volume compared to the stock\'s normal average daily volume. 1.0x = normal. 2.0x = twice the usual volume being traded. Abnormal volume (2x+) often precedes significant price moves and is the most important confirmation signal for breakouts.',
    example: '1.0x = nothing unusual. 2.5x = abnormal — someone significant is trading this stock. A price breakout on 2.5x volume is much more reliable than one on 1.0x.',
  },
  risk_context: {
    label: 'Risk Context',
    body: 'Active warning flags that could weaken or invalidate a setup. Includes: choppy market regime (bad for breakouts), weak volume confirmation (breakout without volume is suspect), breadth divergence (stock rising while most others fall), and options flow not aligned with price direction.',
    example: '"Breadth divergence" = this stock is going up while the broader market is selling off. Historically this is a warning the move may not sustain.',
  },
  market_alignment: {
    label: 'Market Alignment',
    body: 'Whether the overall market\'s direction (bullish/bearish/neutral) is aligned with the setup in this stock. A bullish setup with a bullish market behind it has tailwinds. The same setup in a bearish market is fighting the current — it requires much more conviction.',
    example: 'Setup: bullish. Market: bearish → "misaligned" — the stock is going up against the market, higher risk. Best setups have market alignment supporting them.',
  },
  breadth_confirmation: {
    label: 'Breadth Confirmation',
    body: 'Whether the current advance/decline ratio supports the move in this specific stock. A rising stock is a stronger setup when the broader market is also rising with wide participation. When most stocks are falling and this one is rising, the divergence is a risk factor.',
    example: '380 advances vs 120 declines = broad participation = breadth confirmed. 140 advances vs 360 declines = breadth not confirmed, this stock is going up alone.',
  },
  live_structure: {
    label: 'Live Structure',
    body: 'Real-time intraday technical context for this instrument: where price is relative to VWAP, whether it has broken out of or is still inside the opening range, and what structural phase (compression, breakout, momentum) the chart shows. Updated every minute.',
    example: '"Above VWAP, above opening range, momentum confirmed" = the cleanest intraday setup. All three structure points aligned.',
  },
  sector_strength: {
    label: 'Sector Strength',
    body: 'How strongly a sector is performing today relative to its own baseline, scored 0–100. This accounts for the average move of stocks in the sector, their volume expansion, and the proportion of stocks advancing vs declining within that sector.',
    example: 'Score 75 = most stocks in this sector are up meaningfully on above-average volume — strong sector leadership.',
  },
  above_open: {
    label: 'Above Open %',
    body: 'The percentage of all scanned stocks that are currently trading above their opening price. A high reading suggests broad buying since the open; a low reading suggests selling pressure. Simple but powerful as a market-wide sentiment check.',
    example: '72% above open = most stocks are holding their opening gains — market structure is constructive.',
  },
  accepted: {
    label: 'Accepted %',
    body: 'The percentage of stocks where price has "accepted" at current levels — meaning it has spent meaningful time trading at these prices rather than just briefly touching them. Acceptance indicates the market genuinely values these prices.',
    example: 'Price spikes to a level but immediately pulls back = rejection. Price moves to a level and holds there = acceptance — institutional interest at that price.',
  },
  liquidity: {
    label: 'Liquidity Expansion',
    body: 'The proportion of stocks experiencing abnormally high turnover (volume × price). Expanding liquidity means large participants are actively trading — good for breakout follow-through. Contracting liquidity means the market is thin, increasing the risk of false moves.',
    example: 'Liquidity expansion at a breakout = institutions are participating. Breakout on dry liquidity = high risk of failure.',
  },
  concentration: {
    label: 'Sector Concentration',
    body: 'How much of the market\'s total action is concentrated in the top sector. High concentration (one sector dominating) can mean rotation is happening but the move may be narrow. Low concentration means the activity is spread across sectors — healthier breadth.',
    example: 'Top sector share 55% = more than half the market\'s volume is in one sector. This is concentrated, not broad.',
  },
}
