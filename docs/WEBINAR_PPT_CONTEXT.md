# NubraOSS Options Intelligence — Webinar PPT Context

Use this document as context to generate a PowerPoint presentation for a live webinar on Options Intelligence using the NubraOSS platform. The audience is intermediate retail traders who understand basic derivatives but may not know about OI flow, Greeks, or GEX.

---

## Webinar Goal
Teach participants how to read options market structure (OI, Greeks, GEX, key levels) and show how NubraOSS automates this analysis in real time.

---

## Slide Sequence

### 1. Title Slide
**Title:** Options Intelligence — Reading the Market Like a Pro
**Subtitle:** A practical guide using NubraOSS
**Speaker note:** Intro — today we go from basics to live dashboard signals.

---

### 2. What is an Option?
- A contract giving the buyer the right (not obligation) to buy/sell at a fixed price before expiry
- CALL (CE): right to buy → profits when market goes UP
- PUT (PE): right to sell → profits when market goes DOWN
- Key terms: Strike Price, Premium (LTP), Expiry, Lot Size
- Moneyness: ITM / ATM / OTM
- Formula:
  - CE Payoff = max(Spot − Strike, 0) − Premium
  - PE Payoff = max(Strike − Spot, 0) − Premium
- Example: NIFTY 24200 CE at ₹84 → if NIFTY closes at 24400, payoff = 200 − 84 = ₹116/share × 65 = ₹7,540/lot

---

### 3. Open Interest (OI) — The Commitment Meter
- OI = total number of outstanding (open) contracts
- Unlike Volume (resets daily), OI accumulates over time
- Rising OI = new money entering. Falling OI = positions closing.
- Formula: OI Change = Today's OI − Yesterday's OI
- High OI at a strike = strong support or resistance zone
- Shown in NubraOSS Chain tab as gradient bars per strike

---

### 4. OI Position Tags — Who is Entering?
Four patterns from combining OI change + price direction:

| Tag | OI | Price | What it means |
|-----|-----|-------|---------------|
| LB — Long Buildup | ↑ | ↑ | Buyers entering — Bullish |
| SB — Short Buildup | ↑ | ↓ | Writers entering — Bearish |
| SC — Short Covering | ↓ | ↑ | Shorts buying back — can cause sharp rally |
| LU — Long Unwinding | ↓ | ↓ | Longs exiting — Weakness |

- When you see LB at ATM CE + SB at OTM PE → strongly bullish setup
- In position tracker: LU on your CE long → institutions reducing → WATCH signal

---

### 5. Put-Call Ratio (PCR)
- Formula: PCR = Total PE OI / Total CE OI
- PCR > 1.2 → fear / oversold → contrarian BUY signal
- PCR < 0.7 → greed / overbought → contrarian SELL signal
- Neutral range: 0.8–1.2

| PCR | Sentiment | Likely behaviour |
|-----|-----------|-----------------|
| > 1.5 | Extreme fear | Strong bounce |
| 1.2–1.5 | Bearish | Mild bounce |
| 0.8–1.2 | Neutral | Range / trending |
| 0.5–0.8 | Bullish | Mild correction |
| < 0.5 | Extreme greed | Sharp correction |

---

### 6. Implied Volatility (IV)
- IV = the market's expectation of future move, extracted from option price via Black-Scholes
- Formula: IV = σ such that BS(Spot, Strike, T, r, σ) = Market Premium
- Rising IV → premium expensive → good time to SELL options
- IV Crush → after an event, IV collapses → long buyers lose even if direction right
- Expected daily move = Spot × IV / √252
  - Example: NIFTY 24,133 × 14% / 15.87 = ±213 pts/day
- IV Skew: OTM PE IV > OTM CE IV (fear of downside)

---

### 7. Delta (Δ) — The Most Important Greek
- Formula: Δ = ∂V / ∂S (change in option price per ₹1 move in Spot)
- CE Delta: 0 to +1 (ATM ≈ 0.50, deep ITM ≈ 0.90, deep OTM ≈ 0.05)
- PE Delta: −1 to 0
- Delta also ≈ probability of expiring ITM (CE Δ=0.30 → 30% chance)
- In position tracker:
  - Δ ≥ 0.60 → deep ITM → lock 75% of profit in trailing SL
  - Δ 0.40–0.60 → ATM → lock 60%
  - Δ 0.25–0.40 → OTM → lock 45%
  - Δ < 0.25 → far OTM → lock 30%
  - Δ < 0.15 + in loss → EXIT NOW (option dying)

---

### 8. Gamma (Γ) — The Accelerator
- Formula: Γ = ∂Δ / ∂S (rate of change of Delta per ₹1 move)
- Highest at ATM, especially near expiry
- Long options: positive gamma (profits accelerate, losses slow)
- Short options: negative gamma (dangerous near ATM on expiry)
- Gamma risk is why short sellers face explosive losses on expiry day
- NubraOSS shows Γ per strike in the Greeks column
- 21-DTE rule: for SELL positions, gamma risk accelerates past 21 days to expiry

---

### 9. Theta (θ) — Time Decay
- Formula: θ = ∂V / ∂t (₹ lost per day from time passing)
- For buyers: enemy — premium erodes daily even if spot flat
- For sellers: income — time decay goes into their pocket
- θ/LTP ratio = daily decay as % of premium
  - > 2%/day = dangerously fast decay → exit or roll
  - < 0.5%/day = slow decay → more comfortable hold
- Theta accelerates: doubles in last 30 DTE, doubles again in last 7 DTE
- In NubraOSS: "θ 2.1%/day" shown in position advice. 5-DTE warning triggered.

---

### 10. Vega (ν) — Volatility Sensitivity
- Formula: ν = ∂V / ∂σ (change in option price per 1% change in IV)
- Highest for ATM options with long DTE
- IV crush risk: buying before results → IV collapses → lose money even if direction right
- Sellers benefit from falling IV (vega is their friend)
- Example: NIFTY result day. IV 25% → 14% after. Vega=0.30 → lose ₹330/lot from crush alone.

---

### 11. Gamma Exposure (GEX)
- Formula: GEX = Σ (Gamma × OI × Lot Size × Spot²) / 100 — summed across all strikes
- CE adds to GEX, PE subtracts
- Positive GEX (+GEX): Dealers are long gamma → they BUY dips, SELL rallies → dampens vol → mean-reverting market
- Negative GEX (−GEX): Dealers are short gamma → they SELL dips, BUY rallies → amplifies vol → breakouts and crashes

#### Gamma Flip Level
- The spot price where GEX = 0 (positive → negative crossover)
- Above gamma flip → calm, stable, range-bound
- Below gamma flip → volatile, trending, crash risk
- Most important structural level for intraday traders
- In NubraOSS: crossing below gamma flip for a CE long → EXIT NOW signal

---

### 12. Key Levels
Four levels that define the market battleground:

| Level | Definition | Trading use |
|-------|-----------|-------------|
| Call Wall | Strike with maximum CE OI | Strong resistance — writers defend this level |
| Put Wall | Strike with maximum PE OI | Strong support floor — writers defend this level |
| Gamma Flip | GEX = 0 crossover strike | Pivot: above = stable, below = volatile |
| Max Pain | Strike minimising total option value at expiry | Market gravitates here on expiry |

- Straddle Price = ATM CE LTP + ATM PE LTP → defines expected move range

---

### 13. OIE Signal Engine — How NubraOSS Automates This
Pipeline (runs every 30 seconds):
1. Fetch live option chain (OI, LTP, Greeks for all strikes)
2. Compute GEX per strike, locate call/put walls, gamma flip
3. Aggregate analytics: PCR, IV skew, straddle, OI flow patterns
4. Intelligence engine: synthesize market bias + confidence score
5. Signal engine: composite direction (bullish / bearish / conflicted)
6. Fire alerts when signal changes

Composite score = weighted average of PCR signal + GEX regime + OI flow + IV skew + key level proximity

- Score > 60% aligned → directional signal
- Score 40–60% → conflicted → reduce size

---

### 14. Trade Signals (⚡ in Chain Tab)
When score ≥ 52% and not conflicted, per-strike suggestions appear:

- BUY signal: direction aligned + LB/SC on strike + above gamma flip
  - Default SL = Entry × 0.70, Target = Entry × 1.60
- SELL signal: direction counter to option type + SB + near wall
  - Default SL = Entry × 1.50, Target = Entry × 0.30

Only shows within ATM ±4 strikes — no noise on far OTM strikes.

---

### 15. Greeks-Aware Position Tracker
Monitors open positions using live Greeks every 2 seconds:

| Advice State | Trigger | Action |
|-------------|---------|--------|
| EXIT NOW | SL hit, Δ<0.15+loss, direction flip, gamma flip crossed | Close immediately |
| BOOK ½ | Target hit, near call/put wall, <21 DTE for shorts | Close 50%, trail rest |
| TRAIL SL | Profit ≥15%, delta-based trail ≥5% better than current SL | Move SL up |
| WATCH | θ>2%/day, DTE≤5, OI unwinding (LU tag), signals conflicted | Tighten SL |
| HOLD | All aligned, no risk trigger | No action needed |

Trailing SL formula uses Delta to decide lock percentage:
- Deep ITM (Δ≥0.60) → lock 75% of unrealised gain
- ATM (Δ 0.40–0.60) → lock 60%
- OTM (Δ 0.25–0.40) → lock 45%
- Far OTM (Δ<0.25) → lock 30%
Adjusted ±10% by Theta/LTP ratio (high theta = tighten, low theta = loosen).
SL update only proposed when ≥5% better than current SL (no noise).

---

### 16. Platform Overview — NubraOSS Modules

| Module | What it does |
|--------|-------------|
| Dashboard | Market overview, quick access to all tools |
| Positioning | OI walls, PCR panel, IV skew, sector rotation, breadth |
| Options Intelligence | Full OIE pipeline (8 tabs including Chain, Positions, Signals) |
| Scanner | Volume breakout scanner with live OI filtering |
| Webhook | TradingView alert → auto order execution |
| Scalper | Delta-neutral straddle scalper with live P&L chart |
| Range Trader | Range-based strategy with automated entry/exit |
| Academy | This educational guide (interactive 11-section page) |

Tech stack: FastAPI backend + React/TypeScript frontend. All charts custom SVG. Two WebSocket streams: 30s full analytics + 2s fast LTP for position P&L.

---

### 17. Closing Slide
**Key takeaways:**
1. OI tells you where smart money is positioned
2. Greeks tell you how fast your position is changing
3. GEX tells you whether the market will be calm or explosive
4. Key levels (walls, gamma flip, max pain) define the battlefield
5. NubraOSS synthesizes all of this automatically — you just act on the signal

**Live demo:** Options Intelligence → Chain tab → enable ⚡ Signals → track a position → watch Position Tracker advice update in real time

---

## Design Notes for PPT Generation
- Dark theme preferred (black / dark navy background, accent colors: green for bullish, red for bearish, blue for neutral/levels)
- Each formula should be on its own line, visually highlighted
- OI tag cards (LB/SB/SC/LU) work well as a 2×2 grid slide
- Greek slides: one Greek per slide works better than all four on one slide
- Use a "Platform screenshot placeholder" box on the demo slides (slides 13–16)
- Fonts: monospace or technical font for formulas, clean sans-serif for body text
- Section divider slides between major topics (Options Basics → OI → Greeks → GEX → Platform)
