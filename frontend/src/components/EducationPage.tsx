import { useState } from 'react'
import './education.css'

interface Section { id: string; title: string; sub: string }

const SECTIONS: Section[] = [
  { id: 'intro',     title: 'Options Basics',     sub: 'CE · PE · Payoff' },
  { id: 'oi',        title: 'Open Interest',       sub: 'The Commitment Meter' },
  { id: 'oi-tags',   title: 'OI Position Tags',    sub: 'LB · SB · SC · LU' },
  { id: 'pcr',       title: 'Put-Call Ratio',      sub: 'PCR' },
  { id: 'iv',        title: 'Implied Volatility',  sub: 'IV · Skew · Crush' },
  { id: 'delta',     title: 'Delta Δ',        sub: 'Directional Exposure' },
  { id: 'gamma',     title: 'Gamma Γ',        sub: 'Acceleration Risk' },
  { id: 'theta',     title: 'Theta θ',        sub: 'Time Decay' },
  { id: 'vega',      title: 'Vega ν',         sub: 'Volatility Sensitivity' },
  { id: 'gex',       title: 'Gamma Exposure',      sub: 'GEX · Gamma Flip' },
  { id: 'levels',    title: 'Key Levels',          sub: 'Walls · Flip · Max Pain' },
  { id: 'signals',   title: 'Signal Engine',       sub: 'OIE Pipeline' },
  { id: 'positions', title: 'Position Tracker',    sub: 'Greeks-Aware Advice' },
  { id: 'platform',  title: 'Platform Overview',   sub: 'NubraOSS Modules' },
]

/* ── Layout helpers ──────────────────────────────────────────────────── */
function G2({
  left, right, caption,
}: {
  left: React.ReactNode
  right: React.ReactNode
  caption: string
}) {
  return (
    <div className="edu-grid2">
      <div className="edu-text-col">{left}</div>
      <div className="edu-chart-col">
        <div className="edu-chart-inner">{right}</div>
        <p className="edu-chart-cap">{caption}</p>
      </div>
    </div>
  )
}

function Fml({ children }: { children: string }) {
  return <div className="edu-formula"><code>{children}</code></div>
}

function ICard({
  title, color, children,
}: {
  title: string
  color?: string
  children: React.ReactNode
}) {
  return (
    <div className={`edu-info-card${color ? ` edu-ic-${color}` : ''}`}>
      <div className="edu-ic-title">{title}</div>
      <div className="edu-ic-body">{children}</div>
    </div>
  )
}

function TagRow({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="edu-tag-row">
      {items.map(it => (
        <span key={it.label} className={`edu-tag edu-tag-${it.color}`}>{it.label}</span>
      ))}
    </div>
  )
}

/* ── SVG Diagrams ────────────────────────────────────────────────────── */

function DiagramPayoff() {
  return (
    <svg viewBox="0 0 480 265" style={{ width: '100%', height: 'auto' }}>
      <defs>
        <linearGradient id="payceF" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22C55E" stopOpacity={0.22} />
          <stop offset="100%" stopColor="#22C55E" stopOpacity={0} />
        </linearGradient>
        <linearGradient id="paypeF" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#EF4444" stopOpacity={0.22} />
          <stop offset="100%" stopColor="#EF4444" stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points="295,196 456,196 456,24" fill="url(#payceF)" />
      <polygon points="44,24 205,196 44,196" fill="url(#paypeF)" />
      <line x1={44} y1={18} x2={44} y2={248} stroke="rgba(255,255,255,.12)" strokeWidth={1} />
      <line x1={44} y1={244} x2={460} y2={244} stroke="rgba(255,255,255,.12)" strokeWidth={1} />
      <line x1={44} y1={196} x2={460} y2={196} stroke="rgba(255,255,255,.22)" strokeWidth={1} strokeDasharray="4 4" />
      <text x={36} y={200} fontSize={9} fill="rgba(255,255,255,.4)" textAnchor="end">0</text>
      <text x={36} y={234} fontSize={9} fill="rgba(252,165,165,.5)" textAnchor="end">-84</text>
      <line x1={250} y1={18} x2={250} y2={246} stroke="rgba(111,209,215,.38)" strokeWidth={1} strokeDasharray="3 3" />
      <text x={250} y={14} fontSize={8} fill="rgba(111,209,215,.75)" textAnchor="middle">ATM 24200</text>
      <path d="M 44 234 L 250 234 L 456 24" fill="none" stroke="#22C55E" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 44 24 L 250 234 L 456 234" fill="none" stroke="#EF4444" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={214} cy={196} r={4} fill="#EF4444" opacity={0.9} />
      <circle cx={286} cy={196} r={4} fill="#22C55E" opacity={0.9} />
      <text x={44} y={258} fontSize={9} fill="rgba(255,255,255,.38)" textAnchor="middle">23800</text>
      <text x={250} y={258} fontSize={9} fill="rgba(255,255,255,.38)" textAnchor="middle">24200</text>
      <text x={456} y={258} fontSize={9} fill="rgba(255,255,255,.38)" textAnchor="middle">24600</text>
      <text x={395} y={52} fontSize={10} fill="#86EFAC" fontWeight={700} textAnchor="middle">CE Payoff</text>
      <text x={100} y={52} fontSize={10} fill="#FCA5A5" fontWeight={700} textAnchor="middle">PE Payoff</text>
      <text x={208} y={190} fontSize={8} fill="#FCA5A5" textAnchor="end">BE 24116</text>
      <text x={292} y={190} fontSize={8} fill="#86EFAC" textAnchor="start">BE 24284</text>
    </svg>
  )
}

function DiagramOIChain() {
  return (
    <svg viewBox="0 0 420 278" style={{ width: '100%', height: 'auto' }}>
      <defs>
        <linearGradient id="oiCeG" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#6FD1D7" stopOpacity={0.55} />
          <stop offset="100%" stopColor="#5DF8D8" stopOpacity={0.95} />
        </linearGradient>
        <linearGradient id="oiPeG" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stopColor="#EF4444" stopOpacity={0.55} />
          <stop offset="100%" stopColor="#DC2626" stopOpacity={0.9} />
        </linearGradient>
      </defs>
      <line x1={210} y1={8} x2={210} y2={266} stroke="rgba(255,255,255,.14)" strokeWidth={1} />
      <text x={120} y={12} fontSize={9} fill="rgba(239,68,68,.7)" textAnchor="middle" fontWeight={700}>PE OI</text>
      <text x={210} y={12} fontSize={9} fill="rgba(255,255,255,.45)" textAnchor="middle" fontWeight={700}>STRIKE</text>
      <text x={300} y={12} fontSize={9} fill="rgba(111,209,215,.7)" textAnchor="middle" fontWeight={700}>CE OI</text>
      {/* Row 24400 — CALL WALL */}
      <rect x={210} y={18} width={178} height={36} rx={3} fill="url(#oiCeG)" />
      <rect x={166} y={18} width={44} height={36} rx={3} fill="url(#oiPeG)" opacity={0.7} />
      <text x={210} y={41} fontSize={11} fill="#fff" fontWeight={800} textAnchor="middle">24400</text>
      <text x={390} y={37} fontSize={8} fill="#5DF8D8" fontWeight={800}>CALL WALL</text>
      {/* Row 24300 */}
      <rect x={210} y={62} width={94} height={34} rx={3} fill="url(#oiCeG)" opacity={0.72} />
      <rect x={148} y={62} width={62} height={34} rx={3} fill="url(#oiPeG)" opacity={0.62} />
      <text x={210} y={83} fontSize={11} fill="#fff" fontWeight={700} textAnchor="middle">24300</text>
      {/* Row 24200 ATM */}
      <rect x={28} y={102} width={364} height={38} rx={5} fill="rgba(111,209,215,.06)" stroke="rgba(111,209,215,.2)" strokeWidth={1} />
      <rect x={210} y={105} width={148} height={32} rx={3} fill="url(#oiCeG)" />
      <rect x={118} y={105} width={92} height={32} rx={3} fill="url(#oiPeG)" opacity={0.8} />
      <text x={210} y={125} fontSize={11} fill="#6FD1D7" fontWeight={800} textAnchor="middle">24200  ATM</text>
      {/* Row 24100 */}
      <rect x={210} y={148} width={118} height={34} rx={3} fill="url(#oiCeG)" opacity={0.68} />
      <rect x={100} y={148} width={110} height={34} rx={3} fill="url(#oiPeG)" opacity={0.75} />
      <text x={210} y={169} fontSize={11} fill="#fff" fontWeight={700} textAnchor="middle">24100</text>
      {/* Row 24000 — PUT WALL */}
      <rect x={210} y={190} width={82} height={36} rx={3} fill="url(#oiCeG)" opacity={0.6} />
      <rect x={35} y={190} width={175} height={36} rx={3} fill="url(#oiPeG)" />
      <text x={210} y={213} fontSize={11} fill="#fff" fontWeight={800} textAnchor="middle">24000</text>
      <text x={30} y={210} fontSize={8} fill="#FCA5A5" fontWeight={800} textAnchor="end">PUT WALL</text>
      <circle cx={220} cy={250} r={4} fill="#6FD1D7" />
      <text x={228} y={254} fontSize={9} fill="rgba(255,255,255,.5)">CE OI (calls sold)</text>
      <circle cx={220} cy={266} r={4} fill="#EF4444" />
      <text x={228} y={270} fontSize={9} fill="rgba(255,255,255,.5)">PE OI (puts sold)</text>
    </svg>
  )
}

function DiagramPCRGauge() {
  return (
    <svg viewBox="0 0 380 220" style={{ width: '100%', height: 'auto' }}>
      {/* Zone arcs (cx=190, cy=200, R=130, r=80, 5 zones of 36° each) */}
      {/* Zone 1: 180°→144° — Fear → contrarian bullish */}
      <path d="M 60 200 A 130 130 0 0 0 85 124 L 125 153 A 80 80 0 0 1 110 200 Z" fill="#16A34A" opacity={0.85} />
      {/* Zone 2: 144°→108° */}
      <path d="M 85 124 A 130 130 0 0 0 150 76 L 165 124 A 80 80 0 0 1 125 153 Z" fill="#65A30D" opacity={0.75} />
      {/* Zone 3: 108°→72° — Neutral */}
      <path d="M 150 76 A 130 130 0 0 0 230 76 L 215 124 A 80 80 0 0 1 165 124 Z" fill="#6FD1D7" opacity={0.75} />
      {/* Zone 4: 72°→36° */}
      <path d="M 230 76 A 130 130 0 0 0 295 124 L 255 153 A 80 80 0 0 1 215 124 Z" fill="#CA8A04" opacity={0.7} />
      {/* Zone 5: 36°→0° — Greed */}
      <path d="M 295 124 A 130 130 0 0 0 320 200 L 270 200 A 80 80 0 0 1 255 153 Z" fill="#DC2626" opacity={0.8} />
      <path d="M 60 200 A 130 130 0 0 0 320 200" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth={1} />
      <path d="M 110 200 A 80 80 0 0 0 270 200" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth={1} />
      <text x={48} y={204} fontSize={9} fill="rgba(255,255,255,.55)" textAnchor="middle">1.5+</text>
      <text x={79} y={116} fontSize={9} fill="rgba(255,255,255,.45)" textAnchor="middle">1.3</text>
      <text x={150} y={66} fontSize={9} fill="rgba(255,255,255,.45)" textAnchor="middle">1.0</text>
      <text x={230} y={66} fontSize={9} fill="rgba(255,255,255,.45)" textAnchor="middle">0.8</text>
      <text x={304} y={116} fontSize={9} fill="rgba(255,255,255,.45)" textAnchor="middle">0.6</text>
      <text x={328} y={204} fontSize={9} fill="rgba(255,255,255,.55)" textAnchor="middle">0.5</text>
      <text x={76} y={175} fontSize={8} fill="rgba(255,255,255,.8)" textAnchor="middle" fontWeight={700}>FEAR</text>
      <text x={190} y={84} fontSize={8} fill="rgba(255,255,255,.8)" textAnchor="middle" fontWeight={700}>NEUTRAL</text>
      <text x={307} y={175} fontSize={8} fill="rgba(255,255,255,.8)" textAnchor="middle" fontWeight={700}>GREED</text>
      {/* Needle at PCR=1.35 → ~162° */}
      <line x1={190} y1={200} x2={90} y2={168} stroke="white" strokeWidth={2.5} strokeLinecap="round" opacity={0.9} />
      <circle cx={190} cy={200} r={5} fill="white" opacity={0.9} />
      <circle cx={190} cy={200} r={2} fill="#030810" />
      <text x={190} y={215} fontSize={9} fill="rgba(255,255,255,.7)" textAnchor="middle" fontWeight={700}>PCR 1.35</text>
    </svg>
  )
}

function DiagramIVSkew() {
  return (
    <svg viewBox="0 0 420 240" style={{ width: '100%', height: 'auto' }}>
      <defs>
        <linearGradient id="ivSkewG" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#EF4444" stopOpacity={0.3} />
          <stop offset="50%" stopColor="#6FD1D7" stopOpacity={0.15} />
          <stop offset="100%" stopColor="#22C55E" stopOpacity={0.2} />
        </linearGradient>
      </defs>
      <rect x={24} y={16} width={374} height={200} rx={4} fill="url(#ivSkewG)" />
      <line x1={24} y1={216} x2={398} y2={216} stroke="rgba(255,255,255,.14)" strokeWidth={1} />
      <line x1={24} y1={16} x2={24} y2={216} stroke="rgba(255,255,255,.14)" strokeWidth={1} />
      <line x1={211} y1={16} x2={211} y2={218} stroke="rgba(111,209,215,.35)" strokeWidth={1} strokeDasharray="3 3" />
      <text x={211} y={12} fontSize={8} fill="rgba(111,209,215,.75)" textAnchor="middle">ATM</text>
      <text x={18} y={200} fontSize={8} fill="rgba(255,255,255,.35)" textAnchor="end">12%</text>
      <text x={18} y={150} fontSize={8} fill="rgba(255,255,255,.35)" textAnchor="end">18%</text>
      <text x={18} y={90} fontSize={8} fill="rgba(255,255,255,.35)" textAnchor="end">26%</text>
      <text x={18} y={40} fontSize={8} fill="rgba(255,255,255,.35)" textAnchor="end">32%</text>
      <line x1={24} y1={150} x2={398} y2={150} stroke="rgba(255,255,255,.07)" strokeWidth={1} />
      <path d="M 30 38 C 60 42 90 55 120 75 C 145 90 165 112 180 132 C 192 147 200 157 211 162 C 222 166 235 164 250 168 C 268 172 290 178 320 185 C 350 191 375 196 394 200"
            fill="none" stroke="#6FD1D7" strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={60} cy={48} r={3.5} fill="#EF4444" opacity={0.8} />
      <circle cx={120} cy={76} r={3.5} fill="#F97316" opacity={0.8} />
      <circle cx={211} cy={162} r={4} fill="#6FD1D7" opacity={0.9} />
      <circle cx={265} cy={170} r={3.5} fill="#A3E635" opacity={0.8} />
      <circle cx={340} cy={187} r={3.5} fill="#22C55E" opacity={0.8} />
      <text x={80} y={228} fontSize={8} fill="rgba(239,68,68,.65)" textAnchor="middle">Deep OTM PE</text>
      <text x={211} y={228} fontSize={8} fill="rgba(111,209,215,.65)" textAnchor="middle">ATM</text>
      <text x={340} y={228} fontSize={8} fill="rgba(34,197,94,.65)" textAnchor="middle">OTM CE</text>
      <text x={62} y={36} fontSize={9} fill="#FCA5A5" fontWeight={700} textAnchor="middle">High IV</text>
      <text x={370} y={193} fontSize={9} fill="#86EFAC" fontWeight={700} textAnchor="end">Low IV</text>
    </svg>
  )
}

function DiagramDeltaSCurve() {
  return (
    <svg viewBox="0 0 420 264" style={{ width: '100%', height: 'auto' }}>
      <rect x={20} y={18} width={108} height={230} fill="rgba(239,68,68,.07)" rx={3} />
      <rect x={128} y={18} width={40} height={230} fill="rgba(245,158,11,.07)" />
      <rect x={168} y={18} width={80} height={230} fill="rgba(111,209,215,.09)" />
      <rect x={248} y={18} width={152} height={230} fill="rgba(34,197,94,.07)" rx={3} />
      <line x1={20} y1={248} x2={402} y2={248} stroke="rgba(255,255,255,.14)" strokeWidth={1} />
      <line x1={20} y1={18} x2={20} y2={250} stroke="rgba(255,255,255,.14)" strokeWidth={1} />
      <line x1={208} y1={18} x2={208} y2={250} stroke="rgba(111,209,215,.35)" strokeWidth={1} strokeDasharray="3 3" />
      <text x={208} y={14} fontSize={8} fill="rgba(111,209,215,.75)" textAnchor="middle">ATM 0.50</text>
      <line x1={20} y1={133} x2={402} y2={133} stroke="rgba(255,255,255,.1)" strokeWidth={1} strokeDasharray="2 4" />
      <text x={14} y={252} fontSize={8} fill="rgba(255,255,255,.35)" textAnchor="end">0</text>
      <text x={14} y={135} fontSize={8} fill="rgba(255,255,255,.35)" textAnchor="end">0.5</text>
      <text x={14} y={24} fontSize={8} fill="rgba(255,255,255,.35)" textAnchor="end">1.0</text>
      <path d="M 20 248 C 40 248 60 245 80 240 C 100 234 112 228 125 220 C 140 210 152 196 165 183 C 178 170 188 155 195 143 C 200 135 204 127 208 121 C 212 115 215 108 222 98 C 232 82 244 68 258 56 C 274 42 295 30 320 24 C 350 18 375 18 400 18"
            fill="none" stroke="#6FD1D7" strokeWidth={2.8} strokeLinecap="round" />
      <text x={74} y={258} fontSize={7.5} fill="rgba(239,68,68,.6)" textAnchor="middle">Far OTM</text>
      <text x={148} y={258} fontSize={7.5} fill="rgba(245,158,11,.6)" textAnchor="middle">OTM</text>
      <text x={208} y={260} fontSize={7.5} fill="rgba(111,209,215,.6)" textAnchor="middle">ATM</text>
      <text x={320} y={258} fontSize={7.5} fill="rgba(34,197,94,.6)" textAnchor="middle">Deep ITM</text>
      <circle cx={208} cy={121} r={4} fill="#6FD1D7" opacity={0.9} />
      <circle cx={300} cy={26} r={3.5} fill="#22C55E" opacity={0.8} />
      <circle cx={90} cy={242} r={3.5} fill="#EF4444" opacity={0.8} />
    </svg>
  )
}

function DiagramGammaBells() {
  return (
    <svg viewBox="0 0 420 240" style={{ width: '100%', height: 'auto' }}>
      <defs>
        <linearGradient id="g1DTE" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#A78BFA" stopOpacity={0.35} />
          <stop offset="100%" stopColor="#A78BFA" stopOpacity={0} />
        </linearGradient>
        <linearGradient id="g45DTE" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6FD1D7" stopOpacity={0.25} />
          <stop offset="100%" stopColor="#6FD1D7" stopOpacity={0} />
        </linearGradient>
      </defs>
      <line x1={30} y1={210} x2={400} y2={210} stroke="rgba(255,255,255,.14)" strokeWidth={1} />
      <line x1={30} y1={20} x2={30} y2={212} stroke="rgba(255,255,255,.14)" strokeWidth={1} />
      <line x1={215} y1={20} x2={215} y2={212} stroke="rgba(255,255,255,.15)" strokeWidth={1} strokeDasharray="3 3" />
      <text x={215} y={16} fontSize={8} fill="rgba(255,255,255,.4)" textAnchor="middle">ATM</text>
      {/* 45 DTE curve — wide, flat */}
      <path d="M 30 208 L 60 206 L 90 202 L 120 194 L 150 180 L 175 162 L 195 146 L 210 138 L 215 135 L 220 138 L 235 146 L 255 162 L 280 180 L 310 194 L 340 202 L 370 206 L 400 208 Z"
            fill="url(#g45DTE)" />
      <path d="M 30 208 L 60 206 L 90 202 L 120 194 L 150 180 L 175 162 L 195 146 L 210 138 L 215 135 L 220 138 L 235 146 L 255 162 L 280 180 L 310 194 L 340 202 L 370 206 L 400 208"
            fill="none" stroke="#6FD1D7" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {/* 1 DTE curve — narrow, tall */}
      <path d="M 30 210 L 90 209 L 130 207 L 160 204 L 185 196 L 200 180 L 207 160 L 210 130 L 212 90 L 214 50 L 215 22 L 216 50 L 218 90 L 220 130 L 223 160 L 230 180 L 245 196 L 270 204 L 300 207 L 360 209 L 400 210 Z"
            fill="url(#g1DTE)" />
      <path d="M 30 210 L 90 209 L 130 207 L 160 204 L 185 196 L 200 180 L 207 160 L 210 130 L 212 90 L 214 50 L 215 22 L 216 50 L 218 90 L 220 130 L 223 160 L 230 180 L 245 196 L 270 204 L 300 207 L 360 209 L 400 210"
            fill="none" stroke="#A78BFA" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      <text x={70} y={168} fontSize={9} fill="#6FD1D7" fontWeight={600}>45 DTE</text>
      <text x={70} y={180} fontSize={8} fill="rgba(111,209,215,.55)">Wide, manageable</text>
      <text x={275} y={100} fontSize={9} fill="#A78BFA" fontWeight={600}>1 DTE</text>
      <text x={275} y={112} fontSize={8} fill="rgba(167,139,250,.55)">Narrow, explosive</text>
    </svg>
  )
}

function DiagramThetaDecay() {
  return (
    <svg viewBox="0 0 420 240" style={{ width: '100%', height: 'auto' }}>
      <defs>
        <linearGradient id="thetaDecay" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stopColor="#EF4444" stopOpacity={0.35} />
          <stop offset="40%" stopColor="#F59E0B" stopOpacity={0.2} />
          <stop offset="100%" stopColor="#22C55E" stopOpacity={0.15} />
        </linearGradient>
      </defs>
      <rect x={24} y={16} width={372} height={202} rx={4} fill="url(#thetaDecay)" />
      <line x1={260} y1={16} x2={260} y2={218} stroke="rgba(245,158,11,.3)" strokeWidth={1} strokeDasharray="3 3" />
      <line x1={345} y1={16} x2={345} y2={218} stroke="rgba(239,68,68,.35)" strokeWidth={1} strokeDasharray="3 3" />
      <line x1={24} y1={218} x2={398} y2={218} stroke="rgba(255,255,255,.14)" strokeWidth={1} />
      <line x1={24} y1={16} x2={24} y2={220} stroke="rgba(255,255,255,.14)" strokeWidth={1} />
      <text x={24} y={230} fontSize={8} fill="rgba(255,255,255,.35)" textAnchor="middle">90</text>
      <text x={140} y={230} fontSize={8} fill="rgba(255,255,255,.35)" textAnchor="middle">60</text>
      <text x={260} y={230} fontSize={8} fill="rgba(245,158,11,.5)" textAnchor="middle">30</text>
      <text x={345} y={230} fontSize={8} fill="rgba(239,68,68,.55)" textAnchor="middle">7</text>
      <text x={390} y={230} fontSize={8} fill="rgba(255,255,255,.35)" textAnchor="middle">0</text>
      <text x={207} y={238} fontSize={8} fill="rgba(255,255,255,.3)" textAnchor="middle">DTE</text>
      <text x={18} y={52} fontSize={8} fill="rgba(255,255,255,.35)" textAnchor="end">High</text>
      <text x={18} y={218} fontSize={8} fill="rgba(255,255,255,.35)" textAnchor="end">0</text>
      <path d="M 24 44 C 50 45 90 48 130 54 C 165 59 195 67 220 78 C 245 89 258 100 270 114 C 282 127 295 144 310 158 C 325 172 345 186 360 196 C 373 204 385 210 395 218"
            fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round" opacity={0.9} />
      <circle cx={260} cy={118} r={4} fill="#F59E0B" opacity={0.9} />
      <circle cx={345} cy={188} r={4} fill="#EF4444" opacity={0.9} />
      <text x={100} y={38} fontSize={8.5} fill="rgba(34,197,94,.75)" fontWeight={600}>Slow decay</text>
      <text x={255} y={106} fontSize={8.5} fill="rgba(245,158,11,.85)" fontWeight={600} textAnchor="end">30 DTE: doubles</text>
      <text x={340} y={176} fontSize={8.5} fill="rgba(239,68,68,.85)" fontWeight={600} textAnchor="end">7 DTE: explodes</text>
    </svg>
  )
}

function DiagramVegaCrush() {
  return (
    <svg viewBox="0 0 380 230" style={{ width: '100%', height: 'auto' }}>
      <text x={100} y={16} fontSize={9} fill="rgba(255,255,255,.55)" textAnchor="middle" fontWeight={700}>BEFORE EVENT</text>
      <text x={100} y={28} fontSize={8} fill="rgba(255,255,255,.35)" textAnchor="middle">IV 25%</text>
      <rect x={40} y={42} width={120} height={30} rx={3} fill="rgba(111,209,215,.4)" />
      <text x={100} y={62} fontSize={8} fill="rgba(255,255,255,.85)" textAnchor="middle">Intrinsic ₹80</text>
      <rect x={40} y={74} width={120} height={40} rx={3} fill="rgba(111,209,215,.25)" />
      <text x={100} y={98} fontSize={8} fill="rgba(255,255,255,.75)" textAnchor="middle">Time Value ₹120</text>
      <rect x={40} y={116} width={120} height={60} rx={3} fill="rgba(167,139,250,.35)" />
      <text x={100} y={150} fontSize={8} fill="rgba(221,214,254,.85)" textAnchor="middle">Vega Premium ₹180</text>
      <text x={100} y={196} fontSize={10} fill="#6FD1D7" textAnchor="middle" fontWeight={800}>₹380 total</text>
      <text x={190} y={115} fontSize={18} fill="rgba(255,255,255,.3)" textAnchor="middle">→</text>
      <text x={280} y={16} fontSize={9} fill="rgba(255,255,255,.55)" textAnchor="middle" fontWeight={700}>AFTER EVENT</text>
      <text x={280} y={28} fontSize={8} fill="rgba(255,255,255,.35)" textAnchor="middle">IV 14% (crush)</text>
      <rect x={220} y={42} width={120} height={30} rx={3} fill="rgba(111,209,215,.4)" />
      <text x={280} y={62} fontSize={8} fill="rgba(255,255,255,.85)" textAnchor="middle">Intrinsic ₹160</text>
      <rect x={220} y={74} width={120} height={40} rx={3} fill="rgba(111,209,215,.25)" />
      <text x={280} y={98} fontSize={8} fill="rgba(255,255,255,.75)" textAnchor="middle">Time Value ₹110</text>
      <rect x={220} y={116} width={120} height={24} rx={3} fill="rgba(239,68,68,.3)" />
      <text x={280} y={132} fontSize={8} fill="rgba(252,165,165,.85)" textAnchor="middle">Vega crushed ₹50</text>
      <rect x={220} y={142} width={120} height={36} rx={3} fill="rgba(239,68,68,.1)" stroke="rgba(239,68,68,.3)" strokeWidth={1} strokeDasharray="3 2" />
      <text x={280} y={164} fontSize={8} fill="rgba(239,68,68,.65)" textAnchor="middle">-₹130 from crush</text>
      <text x={280} y={196} fontSize={10} fill="#FCA5A5" textAnchor="middle" fontWeight={800}>₹320 total</text>
      <text x={190} y={218} fontSize={8.5} fill="rgba(239,68,68,.7)" textAnchor="middle">Direction right — still down ₹60 from IV crush</text>
    </svg>
  )
}

function DiagramGEXProfile() {
  return (
    <svg viewBox="0 0 400 272" style={{ width: '100%', height: 'auto' }}>
      <defs>
        <linearGradient id="gexPos" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#22C55E" stopOpacity={0.5} />
          <stop offset="100%" stopColor="#22C55E" stopOpacity={0.9} />
        </linearGradient>
        <linearGradient id="gexNeg" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stopColor="#EF4444" stopOpacity={0.5} />
          <stop offset="100%" stopColor="#EF4444" stopOpacity={0.9} />
        </linearGradient>
      </defs>
      <line x1={200} y1={8} x2={200} y2={258} stroke="rgba(111,209,215,.55)" strokeWidth={1.5} strokeDasharray="4 3" />
      <text x={200} y={5} fontSize={8} fill="rgba(111,209,215,.85)" textAnchor="middle" fontWeight={700}>{'γ'} FLIP</text>
      <text x={110} y={16} fontSize={8} fill="rgba(239,68,68,.65)" textAnchor="middle" fontWeight={700}>-GEX (volatile)</text>
      <text x={290} y={16} fontSize={8} fill="rgba(34,197,94,.65)" textAnchor="middle" fontWeight={700}>+GEX (stable)</text>
      {[
        { y: 22, strike: '24500', posW: 145, negW: 30  },
        { y: 64, strike: '24400', posW: 110, negW: 52  },
        { y: 106, strike: '24300', posW: 72,  negW: 78  },
        { y: 148, strike: '24200', posW: 28,  negW: 124 },
        { y: 190, strike: '24100', posW: 10,  negW: 162 },
        { y: 232, strike: '24000', posW: 5,   negW: 145 },
      ].map(r => (
        <g key={r.strike}>
          <rect x={200} y={r.y} width={r.posW} height={34} rx={2} fill="url(#gexPos)" />
          <rect x={200 - r.negW} y={r.y} width={r.negW} height={34} rx={2} fill="url(#gexNeg)" />
          <text x={200} y={r.y + 22} fontSize={10} fill="rgba(255,255,255,.7)" fontWeight={700} textAnchor="middle">{r.strike}</text>
        </g>
      ))}
      <text x={200} y={268} fontSize={8} fill="rgba(255,255,255,.4)" textAnchor="middle">Above flip = calm · Below flip = volatile</text>
    </svg>
  )
}

function DiagramKeyLevels() {
  return (
    <svg viewBox="0 0 340 290" style={{ width: '100%', height: 'auto' }}>
      <line x1={80} y1={20} x2={80} y2={272} stroke="rgba(255,255,255,.18)" strokeWidth={1.5} />
      {/* Call Wall */}
      <line x1={80} y1={50} x2={320} y2={50} stroke="#EF4444" strokeWidth={2} />
      <text x={76} y={54} fontSize={9} fill="rgba(255,255,255,.45)" textAnchor="end">24500</text>
      <rect x={185} y={40} width={72} height={18} rx={3} fill="rgba(239,68,68,.18)" stroke="rgba(239,68,68,.4)" strokeWidth={1} />
      <text x={221} y={53} fontSize={8} fill="#FCA5A5" textAnchor="middle" fontWeight={700}>CALL WALL</text>
      {/* Straddle range */}
      <rect x={80} y={112} width={240} height={62} fill="rgba(111,209,215,.05)" stroke="rgba(111,209,215,.15)" strokeWidth={1} strokeDasharray="4 3" />
      <text x={200} y={146} fontSize={7.5} fill="rgba(111,209,215,.5)" textAnchor="middle">Straddle Range</text>
      {/* Gamma Flip */}
      <line x1={80} y1={114} x2={320} y2={114} stroke="#6FD1D7" strokeWidth={1.5} strokeDasharray="5 3" />
      <text x={76} y={118} fontSize={9} fill="rgba(255,255,255,.45)" textAnchor="end">24250</text>
      <rect x={172} y={104} width={80} height={18} rx={3} fill="rgba(111,209,215,.15)" stroke="rgba(111,209,215,.35)" strokeWidth={1} />
      <text x={212} y={117} fontSize={8} fill="#6FD1D7" textAnchor="middle" fontWeight={700}>{'γ'} FLIP</text>
      {/* Spot price */}
      <line x1={80} y1={150} x2={320} y2={150} stroke="rgba(255,255,255,.6)" strokeWidth={1.5} />
      <text x={76} y={154} fontSize={9} fill="rgba(255,255,255,.65)" textAnchor="end">24133</text>
      <circle cx={80} cy={150} r={5} fill="white" opacity={0.75} />
      <text x={165} y={147} fontSize={8} fill="rgba(255,255,255,.6)" textAnchor="middle">Spot</text>
      {/* Max Pain */}
      <line x1={80} y1={194} x2={320} y2={194} stroke="#F59E0B" strokeWidth={1.5} strokeDasharray="4 3" />
      <text x={76} y={198} fontSize={9} fill="rgba(255,255,255,.45)" textAnchor="end">23900</text>
      <rect x={170} y={184} width={80} height={18} rx={3} fill="rgba(245,158,11,.12)" stroke="rgba(245,158,11,.35)" strokeWidth={1} />
      <text x={210} y={197} fontSize={8} fill="#FDE68A" textAnchor="middle" fontWeight={700}>MAX PAIN</text>
      {/* Put Wall */}
      <line x1={80} y1={252} x2={320} y2={252} stroke="#22C55E" strokeWidth={2} />
      <text x={76} y={256} fontSize={9} fill="rgba(255,255,255,.45)" textAnchor="end">23700</text>
      <rect x={185} y={242} width={70} height={18} rx={3} fill="rgba(34,197,94,.18)" stroke="rgba(34,197,94,.4)" strokeWidth={1} />
      <text x={220} y={255} fontSize={8} fill="#86EFAC" textAnchor="middle" fontWeight={700}>PUT WALL</text>
    </svg>
  )
}

function DiagramPositionStates() {
  const states = [
    { y: 14,  label: 'EXIT NOW', color: '#EF4444', bg: 'rgba(239,68,68,.18)',   border: 'rgba(239,68,68,.5)',   desc: 'Close immediately' },
    { y: 80,  label: 'BOOK 1/2', color: '#F59E0B', bg: 'rgba(245,158,11,.14)', border: 'rgba(245,158,11,.45)', desc: 'Close 50%, trail rest' },
    { y: 146, label: 'TRAIL SL', color: '#6FD1D7', bg: 'rgba(111,209,215,.14)',border: 'rgba(111,209,215,.45)',desc: 'Move stop-loss up' },
    { y: 212, label: 'WATCH',    color: '#F59E0B', bg: 'rgba(245,158,11,.1)',   border: 'rgba(245,158,11,.35)', desc: 'Tighten, monitor' },
    { y: 278, label: 'HOLD',     color: '#22C55E', bg: 'rgba(34,197,94,.14)',   border: 'rgba(34,197,94,.4)',   desc: 'No action needed' },
  ]
  return (
    <svg viewBox="0 0 290 346" style={{ width: '100%', height: 'auto' }}>
      {states.map(s => (
        <g key={s.label}>
          <rect x={60} y={s.y} width={170} height={52} rx={6} fill={s.bg} stroke={s.border} strokeWidth={1.2} />
          <text x={145} y={s.y + 24} fontSize={12} fill={s.color} fontWeight={800} textAnchor="middle">{s.label}</text>
          <text x={145} y={s.y + 40} fontSize={8} fill="rgba(255,255,255,.45)" textAnchor="middle">{s.desc}</text>
        </g>
      ))}
      {[66, 132, 198, 264].map(y => (
        <g key={y}>
          <line x1={145} y1={y} x2={145} y2={y + 14} stroke="rgba(255,255,255,.2)" strokeWidth={1} />
          <path d={`M 141 ${y + 12} L 145 ${y + 16} L 149 ${y + 12}`} fill="none" stroke="rgba(255,255,255,.3)" strokeWidth={1} strokeLinejoin="round" />
        </g>
      ))}
      <text x={54} y={42}  fontSize={7.5} fill="rgba(239,68,68,.6)"  textAnchor="end">SL hit</text>
      <text x={54} y={108} fontSize={7.5} fill="rgba(245,158,11,.6)" textAnchor="end">Target hit</text>
      <text x={54} y={174} fontSize={7.5} fill="rgba(111,209,215,.6)"textAnchor="end">+15% profit</text>
      <text x={54} y={240} fontSize={7.5} fill="rgba(245,158,11,.6)" textAnchor="end">{'θ'} {'>'} 2%</text>
      <text x={54} y={306} fontSize={7.5} fill="rgba(34,197,94,.6)"  textAnchor="end">Aligned</text>
    </svg>
  )
}

/* ── Section content ─────────────────────────────────────────────────── */

function SectionIntro() {
  return (
    <G2
      caption="CE &amp; PE payoff at expiry — NIFTY 24200, premium ₹84"
      left={
        <>
          <p className="edu-p">A contract giving the buyer the <strong>right</strong> — not the obligation — to buy or sell an underlying at a fixed price before expiry.</p>
          <TagRow items={[
            { label: 'CE — Call: profits when price rises', color: 'green' },
            { label: 'PE — Put: profits when price falls',  color: 'red'   },
          ]} />
          <Fml>{'CE Payoff = max(Spot − Strike, 0) − Premium'}</Fml>
          <Fml>{'PE Payoff = max(Strike − Spot, 0) − Premium'}</Fml>
          <ICard title="Example">
            <p>NIFTY 24200 CE at <strong>₹84</strong> — closes at 24,400<br />
            Payoff = (200 − 84) × 65 = <strong style={{ color: '#86EFAC' }}>₹7,540 / lot</strong></p>
          </ICard>
          <ICard title="Key Terms">
            <div className="edu-kv">
              <span className="edu-kv-k">Strike</span><span>Fixed price in the contract</span>
              <span className="edu-kv-k">Premium</span><span>Price paid for the option (LTP)</span>
              <span className="edu-kv-k">ITM / OTM / ATM</span><span>Moneyness relative to spot</span>
              <span className="edu-kv-k">Lot Size</span><span>NIFTY = 75, BankNifty = 30</span>
            </div>
          </ICard>
        </>
      }
      right={<DiagramPayoff />}
    />
  )
}

function SectionOI() {
  return (
    <G2
      caption="OI chain — CE OI right (teal), PE OI left (red), ATM highlighted"
      left={
        <>
          <p className="edu-p">Total number of outstanding open contracts. Unlike volume which resets daily, OI accumulates and reveals where money is committed.</p>
          <Fml>{'OI Change = Today\'s OI − Yesterday\'s OI'}</Fml>
          <ICard title="What OI Change Signals">
            <div className="edu-kv">
              <span className="edu-kv-k">OI rises</span><span>Fresh money entering — new positions opened</span>
              <span className="edu-kv-k">OI falls</span><span>Positions closing — money exiting the strike</span>
            </div>
          </ICard>
          <ICard title="Why High OI at a Strike Matters" color="teal">
            <p>Writers have sold heavily at that strike and hedge near expiry. This creates strong support (put wall) or resistance (call wall).</p>
          </ICard>
          <TagRow items={[
            { label: 'Call Wall = max CE OI', color: 'red'   },
            { label: 'Put Wall = max PE OI',  color: 'green' },
          ]} />
        </>
      }
      right={<DiagramOIChain />}
    />
  )
}

function SectionOITags() {
  const cards = [
    { id: 'lb', cls: 'edu-oi-card-lb', tag: 'LB', name: 'Long Buildup',    sentiment: 'Bullish',          sc: '#86EFAC', oiDir: 1,  priceDir: 1,  desc: 'OI rising + Price rising. New buyers entering — smart money going long.' },
    { id: 'sb', cls: 'edu-oi-card-sb', tag: 'SB', name: 'Short Buildup',   sentiment: 'Bearish',          sc: '#FCA5A5', oiDir: 1,  priceDir: -1, desc: 'OI rising + Price falling. Writers adding short positions — bearish pressure.' },
    { id: 'sc', cls: 'edu-oi-card-sc', tag: 'SC', name: 'Short Covering',  sentiment: 'Bullish squeeze',  sc: '#FDE68A', oiDir: -1, priceDir: 1,  desc: 'OI falling + Price rising. Shorts buying back — often a sharp forced rally.' },
    { id: 'lu', cls: 'edu-oi-card-lu', tag: 'LU', name: 'Long Unwinding',  sentiment: 'Bearish weakness', sc: '#CBD5E1', oiDir: -1, priceDir: -1, desc: 'OI falling + Price falling. Longs exiting — institutions reducing exposure.' },
  ]
  return (
    <div className="edu-full">
      <p className="edu-p">Four patterns emerge from combining <strong>OI direction</strong> and <strong>price direction</strong>. They reveal whether buyers or sellers are entering or exiting.</p>
      <div className="edu-oi-grid">
        {cards.map(c => (
          <div key={c.id} className={`edu-oi-card ${c.cls}`}>
            <div className="edu-oi-card-head">
              <span className="edu-oi-tag-badge">{c.tag}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{c.name}</div>
                <div className="edu-oi-card-sentiment" style={{ color: c.sc }}>{c.sentiment}</div>
              </div>
              <svg width={44} height={36} viewBox="0 0 44 36" style={{ marginLeft: 'auto', flexShrink: 0 }}>
                <text x={10} y={10} fontSize={7} fill="rgba(255,255,255,.45)" textAnchor="middle">OI</text>
                {c.oiDir > 0
                  ? <path d="M 10 26 L 10 14 M 6 18 L 10 14 L 14 18" stroke="#86EFAC" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  : <path d="M 10 14 L 10 26 M 6 22 L 10 26 L 14 22" stroke="#FCA5A5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                }
                <text x={34} y={10} fontSize={7} fill="rgba(255,255,255,.45)" textAnchor="middle">Price</text>
                {c.priceDir > 0
                  ? <path d="M 34 26 L 34 14 M 30 18 L 34 14 L 38 18" stroke="#86EFAC" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  : <path d="M 34 14 L 34 26 M 30 22 L 34 26 L 38 22" stroke="#FCA5A5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                }
              </svg>
            </div>
            <p className="edu-oi-card-desc">{c.desc}</p>
          </div>
        ))}
      </div>
      <ICard title="In Practice" color="teal">
        <p>LB at ATM CE + SB at OTM PE = strongly bullish setup. If you hold a CE long and see LU appearing on that strike — institutions are reducing — tighten your stop immediately.</p>
      </ICard>
    </div>
  )
}

function SectionPCR() {
  return (
    <G2
      caption="PCR gauge — needle at 1.35 (bearish zone, contrarian bounce signal)"
      left={
        <>
          <p className="edu-p">Measures market sentiment from put vs call open interest. Extreme readings are <strong>contrarian signals</strong> — fear is bullish, greed is bearish.</p>
          <Fml>{'PCR = Total PE OI / Total CE OI'}</Fml>
          <table className="edu-pcr-table">
            <thead><tr><th>PCR</th><th>Sentiment</th><th>Signal</th></tr></thead>
            <tbody>
              <tr><td style={{ color: '#86EFAC' }}>{'> 1.5'}</td><td>Extreme fear</td><td style={{ color: '#86EFAC' }}>Strong bounce</td></tr>
              <tr><td style={{ color: '#A3E635' }}>1.2 – 1.5</td><td>Bearish</td><td style={{ color: '#A3E635' }}>Mild bounce</td></tr>
              <tr><td style={{ color: '#6FD1D7' }}>0.8 – 1.2</td><td>Neutral</td><td style={{ color: '#6FD1D7' }}>Range / trend</td></tr>
              <tr><td style={{ color: '#FDE68A' }}>0.5 – 0.8</td><td>Bullish</td><td style={{ color: '#FDE68A' }}>Mild correction</td></tr>
              <tr><td style={{ color: '#FCA5A5' }}>{'< 0.5'}</td><td>Extreme greed</td><td style={{ color: '#FCA5A5' }}>Sharp correction</td></tr>
            </tbody>
          </table>
          <ICard title="Platform" color="teal">
            <p>Live PCR in the Analytics and Intelligence tabs. The composite bias score weighs PCR alongside GEX regime, OI flow, and IV skew.</p>
          </ICard>
        </>
      }
      right={<DiagramPCRGauge />}
    />
  )
}

function SectionIV() {
  return (
    <G2
      caption="IV skew — OTM puts carry higher IV than OTM calls (fear of downside)"
      left={
        <>
          <p className="edu-p">The market's expectation of future volatility, extracted from option prices. IV reflects <strong>fear and uncertainty</strong>, not historical movement.</p>
          <Fml>{'Expected Daily Move = Spot × IV / √252'}</Fml>
          <ICard title="Example">
            <p>NIFTY 24,133 at IV = 14% → expected move = <strong>±213 pts/day</strong></p>
          </ICard>
          <ICard title="IV Crush Risk" color="red">
            <p>After an event (results, RBI), IV collapses. Even if direction is correct, the buyer can lose money because premium shrinks sharply.</p>
          </ICard>
          <ICard title="IV Skew" color="amber">
            <p>OTM puts consistently carry higher IV than equivalent OTM calls — the market prices in fear of sharp downside moves asymmetrically.</p>
          </ICard>
        </>
      }
      right={<DiagramIVSkew />}
    />
  )
}

function SectionDelta() {
  return (
    <G2
      caption="Delta S-curve: 0 (far OTM) → 0.50 (ATM) → 1.0 (deep ITM)"
      left={
        <>
          <p className="edu-p">Rate of change of option price per ₹1 move in the underlying. Also approximates the <strong>probability of expiring ITM</strong>.</p>
          <Fml>{'Δ = ∂V / ∂S'}</Fml>
          <TagRow items={[
            { label: 'CE Δ: 0 to +1', color: 'green' },
            { label: 'PE Δ: -1 to 0', color: 'red' },
            { label: 'ATM Δ ≈ 0.50', color: 'teal' },
          ]} />
          <ICard title="Delta-Based Trailing SL in NubraOSS" color="teal">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[
                { range: 'Δ ≥ 0.60 (Deep ITM)', lock: 'Lock 75%', c: '#86EFAC' },
                { range: 'Δ 0.40–0.60 (ATM)',   lock: 'Lock 60%', c: '#A3E635' },
                { range: 'Δ 0.25–0.40 (OTM)',   lock: 'Lock 45%', c: '#FDE68A' },
                { range: 'Δ < 0.25 (Far OTM)',       lock: 'Lock 30%', c: '#F59E0B' },
                { range: 'Δ < 0.15 + in loss',       lock: 'EXIT NOW', c: '#FCA5A5' },
              ].map(r => (
                <div key={r.range} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, gap: 8 }}>
                  <span style={{ color: 'var(--fg-faint)' }}>{r.range}</span>
                  <strong style={{ color: r.c }}>{r.lock}</strong>
                </div>
              ))}
            </div>
          </ICard>
        </>
      }
      right={<DiagramDeltaSCurve />}
    />
  )
}

function SectionGamma() {
  return (
    <G2
      caption="Gamma bell curves — 1 DTE (purple, sharp) vs 45 DTE (teal, wide)"
      left={
        <>
          <p className="edu-p">Rate of change of Delta per ₹1 move. Gamma is highest at ATM and accelerates sharply near expiry.</p>
          <Fml>{'Γ = ∂Δ / ∂S = ∂²V / ∂S²'}</Fml>
          <ICard title="Long Options — Positive Gamma" color="green">
            <p>Profits accelerate as the underlying moves in your direction. Losses slow as it moves against you. Gamma works in your favour.</p>
          </ICard>
          <ICard title="Short Options — Negative Gamma" color="red">
            <p>Dangerous near ATM on expiry. A small move against you causes a rapidly increasing loss as delta accelerates — the "short gamma trap."</p>
          </ICard>
          <ICard title="21-DTE Rule" color="amber">
            <p>Gamma risk accelerates past 21 days to expiry for short positions. NubraOSS shows a warning when {'<'} 21 DTE on active short positions.</p>
          </ICard>
        </>
      }
      right={<DiagramGammaBells />}
    />
  )
}

function SectionTheta() {
  return (
    <G2
      caption="Premium decay curve — slow far from expiry, then explosive near zero DTE"
      left={
        <>
          <p className="edu-p">The daily rupee loss in an option's value from the passage of time, assuming everything else is constant.</p>
          <Fml>{'θ = ∂V / ∂t  (₹ lost per day)'}</Fml>
          <ICard title="Buyer vs Seller">
            <div className="edu-kv">
              <span className="edu-kv-k">Buyer</span><span>Theta is the enemy — premium erodes even when spot is flat</span>
              <span className="edu-kv-k">Seller</span><span>Theta is income — decay flows into your account daily</span>
            </div>
          </ICard>
          <ICard title="NubraOSS: Theta / LTP Ratio" color="amber">
            <div className="edu-kv">
              <span className="edu-kv-k">{'θ/LTP > 2%/day'}</span><span style={{ color: '#FCA5A5' }}>Dangerously fast — exit or roll</span>
              <span className="edu-kv-k">{'θ/LTP < 0.5%/day'}</span><span style={{ color: '#86EFAC' }}>Comfortable hold</span>
            </div>
          </ICard>
          <ICard title="Theta Acceleration" color="red">
            <p>Theta roughly <strong>doubles in the last 30 DTE</strong> and doubles again in the last <strong>7 DTE</strong>. The decay curve is non-linear — slow then explosive near expiry.</p>
          </ICard>
        </>
      }
      right={<DiagramThetaDecay />}
    />
  )
}

function SectionVega() {
  return (
    <G2
      caption="IV crush — option value before event vs after (direction right, still loses to crush)"
      left={
        <>
          <p className="edu-p">Sensitivity of the option price to a 1% change in Implied Volatility. Highest for ATM options with long DTE.</p>
          <Fml>{'ν = ∂V / ∂σ  (₹ per 1% IV move)'}</Fml>
          <ICard title="IV Crush — The Silent Killer" color="red">
            <p>Buying before a high-IV event is dangerous. Even when direction is correct, IV collapse destroys premium gained from the move.</p>
            <div style={{ marginTop: 8 }} className="edu-kv">
              <span className="edu-kv-k">Before</span><span>IV = 25%, Vega = 0.30</span>
              <span className="edu-kv-k">Event</span><span>NIFTY moves +80 pts as expected</span>
              <span className="edu-kv-k">After</span><span>IV = 14% → <strong style={{ color: '#FCA5A5' }}>-₹330/lot from crush</strong></span>
            </div>
          </ICard>
          <ICard title="Sellers Benefit" color="green">
            <p>Option sellers benefit from falling IV — their short premium is now worth less. Selling before results and buying back after crush is a common strategy.</p>
          </ICard>
        </>
      }
      right={<DiagramVegaCrush />}
    />
  )
}

function SectionGEX() {
  return (
    <G2
      caption="GEX profile — green (dealers long gamma, stable) vs red (dealers short gamma, volatile)"
      left={
        <>
          <p className="edu-p">Aggregate dealer gamma across all strikes. Tells you whether market makers are stabilising or amplifying price moves.</p>
          <Fml>{'GEX = Σ (Γ × OI × Lot × Spot²) / 100'}</Fml>
          <ICard title="Positive GEX" color="green">
            <p>Dealers are <strong>long gamma</strong> → they buy dips and sell rallies → market is dampened → expect range-bound, mean-reverting behaviour.</p>
          </ICard>
          <ICard title="Negative GEX" color="red">
            <p>Dealers are <strong>short gamma</strong> → they sell dips and buy rallies → moves amplify → breakouts, fast trends, and crashes become more likely.</p>
          </ICard>
          <ICard title="Gamma Flip" color="teal">
            <p>Strike where GEX crosses from positive to negative. <strong>Above = stable. Below = volatile.</strong> Crossing below it on a CE long triggers EXIT NOW in NubraOSS.</p>
          </ICard>
        </>
      }
      right={<DiagramGEXProfile />}
    />
  )
}

function SectionLevels() {
  return (
    <G2
      caption="Market battleground — call wall (resistance), put wall (support), gamma flip (pivot)"
      left={
        <>
          <p className="edu-p">Four price levels that define where the market finds support, resistance, or regime change.</p>
          <div className="edu-table-wrap">
            <table className="edu-table">
              <thead><tr><th>Level</th><th>Definition</th><th>Use</th></tr></thead>
              <tbody>
                <tr><td style={{ color: '#FCA5A5', fontWeight: 700 }}>Call Wall</td><td>Max CE OI strike</td><td>Strong resistance</td></tr>
                <tr><td style={{ color: '#86EFAC', fontWeight: 700 }}>Put Wall</td><td>Max PE OI strike</td><td>Strong support floor</td></tr>
                <tr><td style={{ color: '#6FD1D7', fontWeight: 700 }}>Gamma Flip</td><td>GEX = 0 strike</td><td>Above = stable, Below = volatile</td></tr>
                <tr><td style={{ color: '#FDE68A', fontWeight: 700 }}>Max Pain</td><td>Min total option value at expiry</td><td>Expiry gravity level</td></tr>
              </tbody>
            </table>
          </div>
          <Fml>{'Straddle Range = ATM CE LTP + ATM PE LTP'}</Fml>
          <ICard title="Trading Use" color="teal">
            <p>Long CE above gamma flip and below call wall = ideal entry zone. Spot breaking below gamma flip = exit CE longs immediately.</p>
          </ICard>
        </>
      }
      right={<DiagramKeyLevels />}
    />
  )
}

function SectionSignals() {
  const steps = [
    { n: '1', label: 'Fetch Option Chain',    desc: 'OI, LTP, Greeks for all strikes via Nubra API — runs every 30 seconds' },
    { n: '2', label: 'Compute GEX & Levels',  desc: 'GEX per strike, gamma flip, call/put walls, max pain, straddle range' },
    { n: '3', label: 'Aggregate Analytics',   desc: 'PCR, IV skew, OI flow patterns (LB/SB/SC/LU) per strike, theta ratios' },
    { n: '4', label: 'Intelligence Engine',   desc: 'Synthesise market bias (Bullish/Bearish/Conflicted) + confidence score 0-100%' },
    { n: '5', label: 'Signal Engine',         desc: 'Composite direction per strike: score > 52% and aligned → BUY or SELL signal' },
    { n: '6', label: 'Fire Alerts',           desc: 'Signal changes, SL hits, DTE warnings, theta rate alerts pushed to Position Tracker' },
  ]
  return (
    <div className="edu-full">
      <p className="edu-p">The OIE pipeline runs every 30 seconds, layering market data through six stages to produce a confidence-scored directional signal.</p>
      <Fml>{'Composite Score = weighted(PCR + GEX regime + OI flow + IV skew + level proximity)'}</Fml>
      <div className="edu-pipeline">
        {steps.map(s => (
          <div key={s.n} className="edu-pipe-step">
            <div className="edu-pipe-num">{s.n}</div>
            <div>
              <div className="edu-pipe-label">{s.label}</div>
              <div className="edu-pipe-desc">{s.desc}</div>
            </div>
          </div>
        ))}
      </div>
      <ICard title="Signal Thresholds" color="teal">
        <div className="edu-kv">
          <span className="edu-kv-k">Score {'>'} 60%</span><span>Strong directional signal — consider entry</span>
          <span className="edu-kv-k">Score 40–60%</span><span>Conflicted — reduce size or wait</span>
          <span className="edu-kv-k">Score {'<'} 40%</span><span>No signal — market is uncertain, stay flat</span>
        </div>
      </ICard>
    </div>
  )
}

function SectionPositions() {
  return (
    <G2
      caption="Position advice state machine — updated every 2 seconds using live Greeks"
      left={
        <>
          <p className="edu-p">Every open position is monitored using live Greeks from a 2-second fast LTP stream. The engine produces one of five advice states.</p>
          <div className="edu-table-wrap">
            <table className="edu-table">
              <thead><tr><th>State</th><th>Trigger</th></tr></thead>
              <tbody>
                <tr><td style={{ color: '#FCA5A5', fontWeight: 700 }}>EXIT NOW</td><td>SL hit, {'Δ < 0.15'}+loss, direction flip, gamma flip crossed</td></tr>
                <tr><td style={{ color: '#FDE68A', fontWeight: 700 }}>BOOK 1/2</td><td>Target hit, near call/put wall, {'<'} 21 DTE on shorts</td></tr>
                <tr><td style={{ color: '#6FD1D7', fontWeight: 700 }}>TRAIL SL</td><td>Profit ≥ 15%, delta-based trail ≥ 5% better than current SL</td></tr>
                <tr><td style={{ color: '#F59E0B', fontWeight: 700 }}>WATCH</td><td>{'θ > 2%/day'}, DTE ≤ 5, LU tag on position, signals conflicted</td></tr>
                <tr><td style={{ color: '#86EFAC', fontWeight: 700 }}>HOLD</td><td>All aligned, no risk trigger — no action needed</td></tr>
              </tbody>
            </table>
          </div>
          <ICard title="SL Trail Formula" color="teal">
            <p>New SL = max(current SL, entry + unrealised gain × lock%).<br />
            Lock % is from the Delta tier. Adjusted ±10% by Theta/LTP (high theta = tighten). SL only updates when ≥ 5% better — no noise.</p>
          </ICard>
        </>
      }
      right={<DiagramPositionStates />}
    />
  )
}

function SectionPlatform() {
  const modules = [
    { name: 'Dashboard',            desc: 'Market overview and quick access to all modules. Live instrument tiles.' },
    { name: 'Positioning',          desc: 'OI walls, PCR panel, IV skew, sector rotation, market breadth.' },
    { name: 'Options Intelligence', desc: '8 tabs — Intelligence, Analytics, Signals, Chain, Positions, Strategy, Alerts, Automation.' },
    { name: 'Scanner',              desc: 'Volume breakout scanner with live OI filtering and configurable thresholds.' },
    { name: 'Webhook',              desc: 'TradingView alert to auto order execution. Configurable lot size and routing.' },
    { name: 'Scalper',              desc: 'Straddle scalper with delta-neutral positioning and live P&L chart.' },
    { name: 'Range Trader',         desc: 'Range-based strategy module — under active development.' },
    { name: 'Academy',              desc: 'This interactive educational guide covering OI, Greeks, GEX, signals and more.' },
  ]
  return (
    <div className="edu-full">
      <p className="edu-p">NubraOSS is a FastAPI backend + React/TypeScript frontend with two live WebSocket streams — 30s full analytics and a 2s fast LTP stream for position P&amp;L.</p>
      <div className="edu-platform-grid">
        {modules.map(m => (
          <div key={m.name} className="edu-platform-card">
            <div className="edu-platform-name">{m.name}</div>
            <div className="edu-platform-desc">{m.desc}</div>
          </div>
        ))}
      </div>
      <ICard title="Tech Stack" color="teal">
        <div className="edu-kv">
          <span className="edu-kv-k">Backend</span><span>FastAPI · Python · Nubra OMS API · WebSockets</span>
          <span className="edu-kv-k">Frontend</span><span>React 18 · TypeScript · Vite · Custom SVG charts</span>
          <span className="edu-kv-k">Streams</span><span>ws/oie (30s analytics) · ws/oie-ltp (2s fast P&amp;L)</span>
        </div>
      </ICard>
    </div>
  )
}

/* ── Router ──────────────────────────────────────────────────────────── */
function SectionContent({ id }: { id: string }) {
  switch (id) {
    case 'intro':     return <SectionIntro />
    case 'oi':        return <SectionOI />
    case 'oi-tags':   return <SectionOITags />
    case 'pcr':       return <SectionPCR />
    case 'iv':        return <SectionIV />
    case 'delta':     return <SectionDelta />
    case 'gamma':     return <SectionGamma />
    case 'theta':     return <SectionTheta />
    case 'vega':      return <SectionVega />
    case 'gex':       return <SectionGEX />
    case 'levels':    return <SectionLevels />
    case 'signals':   return <SectionSignals />
    case 'positions': return <SectionPositions />
    case 'platform':  return <SectionPlatform />
    default:          return null
  }
}

/* ── Main Component ──────────────────────────────────────────────────── */
export default function EducationPage({ onClose }: { onClose: () => void }) {
  const [idx, setIdx] = useState(0)
  const section = SECTIONS[idx]

  return (
    <div className="edu-root">
      {/* Header */}
      <div className="edu-header">
        <div className="edu-header-left">
          <span className="edu-header-title">Academy</span>
          <span className="edu-header-sep">/</span>
          <span className="edu-header-sub">Options Intelligence Guide</span>
        </div>
        <button className="edu-close" onClick={onClose}>Close</button>
      </div>

      <div className="edu-layout">
        {/* Sidebar */}
        <nav className="edu-sidebar">
          {SECTIONS.map((s, i) => (
            <button
              key={s.id}
              className={`edu-nav-item${i === idx ? ' active' : ''}`}
              onClick={() => setIdx(i)}
            >
              <span className="edu-nav-num">{i + 1}</span>
              <span>{s.title}</span>
            </button>
          ))}
        </nav>

        {/* Main */}
        <main className="edu-main">
          <div className="edu-section-header">
            <div className="edu-section-pre">{String(idx + 1).padStart(2, '0')} of {SECTIONS.length}</div>
            <h2 className="edu-section-title">{section.title}</h2>
            <div className="edu-section-sub">{section.sub}</div>
          </div>
          <SectionContent id={section.id} />
        </main>
      </div>

      {/* Footer */}
      <div className="edu-footer">
        <button className="btn-ghost" disabled={idx === 0} onClick={() => setIdx(i => Math.max(0, i - 1))}>
          Previous
        </button>
        <div className="edu-footer-dots">
          {SECTIONS.map((_, i) => (
            <span key={i} className={`edu-dot${i === idx ? ' active' : ''}`} onClick={() => setIdx(i)} />
          ))}
        </div>
        {idx < SECTIONS.length - 1 ? (
          <button className="btn-primary" onClick={() => setIdx(i => i + 1)}>Next</button>
        ) : (
          <button className="btn-primary" onClick={onClose}>Enter Dashboard</button>
        )}
      </div>
    </div>
  )
}
