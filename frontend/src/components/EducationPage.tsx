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

/* ── SMC Sections ────────────────────────────────────────────────────────── */
const SMC_SECTIONS: Section[] = [
  { id: 'smc-struct', title: 'Market Structure',   sub: 'HH · HL · LH · LL' },
  { id: 'smc-ob',     title: 'Order Blocks',        sub: 'OB↑ · OB↓ · Mitigation' },
  { id: 'smc-fvg',    title: 'Fair Value Gap',      sub: 'FVG · Imbalance · Fill' },
  { id: 'smc-bos',    title: 'BOS & CHoCH',         sub: 'Break of Structure · Reversal' },
  { id: 'smc-liq',    title: 'Liquidity',           sub: 'BSL · SSL · Stop Hunts' },
  { id: 'smc-pd',     title: 'Premium / Discount',  sub: 'Equilibrium · Golden Zone' },
]

/* ── SMC SVG Diagrams ─────────────────────────────────────────────────────── */

function DiagramSMCStructure() {
  const path = 'M 25 225 L 95 148 L 155 183 L 230 100 L 294 142 L 370 68'
  return (
    <svg viewBox="0 0 420 255" style={{ width: '100%', height: 'auto' }}>
      <line x1={20} y1={238} x2={400} y2={238} stroke="rgba(255,255,255,.08)" strokeWidth={1} />
      <line x1={20} y1={20} x2={20} y2={238} stroke="rgba(255,255,255,.08)" strokeWidth={1} />
      <path d={`${path} L 370 238 L 25 238 Z`} fill="rgba(38,201,168,.05)" />
      <line x1={95} y1={148} x2={230} y2={148} stroke="rgba(255,255,255,.1)" strokeWidth={1} strokeDasharray="3 4" />
      <line x1={230} y1={100} x2={370} y2={100} stroke="rgba(255,255,255,.1)" strokeWidth={1} strokeDasharray="3 4" />
      <line x1={25} y1={225} x2={155} y2={225} stroke="rgba(38,201,168,.15)" strokeWidth={1} strokeDasharray="3 4" />
      <line x1={155} y1={183} x2={294} y2={183} stroke="rgba(38,201,168,.15)" strokeWidth={1} strokeDasharray="3 4" />
      <path d={path} fill="none" stroke="#26C9A8" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={25} cy={225} r={4.5} fill="#F0607A" />
      <circle cx={95} cy={148} r={3.5} fill="rgba(255,255,255,.55)" />
      <circle cx={155} cy={183} r={4.5} fill="#26C9A8" />
      <circle cx={230} cy={100} r={4.5} fill="rgba(255,255,255,.9)" />
      <circle cx={294} cy={142} r={4.5} fill="#26C9A8" />
      <circle cx={370} cy={68} r={4.5} fill="rgba(255,255,255,.9)" />
      <text x={25} y={244} fontSize={9} fill="#F0607A" textAnchor="middle" fontWeight={700}>LL</text>
      <text x={95} y={140} fontSize={9} fill="rgba(255,255,255,.55)" textAnchor="middle" fontWeight={700}>LH</text>
      <text x={155} y={200} fontSize={9} fill="#26C9A8" textAnchor="middle" fontWeight={700}>HL</text>
      <text x={230} y={91} fontSize={9} fill="rgba(255,255,255,.9)" textAnchor="middle" fontWeight={700}>HH</text>
      <text x={294} y={159} fontSize={9} fill="#26C9A8" textAnchor="middle" fontWeight={700}>HL</text>
      <text x={370} y={59} fontSize={9} fill="rgba(255,255,255,.9)" textAnchor="middle" fontWeight={700}>HH</text>
      <rect x={4} y={4} width={110} height={16} rx={3} fill="rgba(38,201,168,.12)" stroke="rgba(38,201,168,.3)" strokeWidth={1} />
      <text x={59} y={15} fontSize={9} fill="#26C9A8" textAnchor="middle" fontWeight={700}>BULLISH STRUCTURE</text>
    </svg>
  )
}

function DiagramOrderBlocks() {
  return (
    <svg viewBox="0 0 420 270" style={{ width: '100%', height: 'auto' }}>
      <line x1={210} y1={10} x2={210} y2={260} stroke="rgba(255,255,255,.07)" strokeWidth={1} />
      <text x={105} y={18} fontSize={9} fill="#26C9A8" textAnchor="middle" fontWeight={700}>BULLISH OB↑</text>
      {[{ x: 30, bodyT: 118, bodyB: 140, wT: 111, wB: 147 }, { x: 58, bodyT: 132, bodyB: 155, wT: 124, wB: 163 }].map((c, i) => (
        <g key={i}>
          <line x1={c.x + 6} y1={c.wT} x2={c.x + 6} y2={c.wB} stroke="#F0607A" strokeWidth={1} />
          <rect x={c.x} y={c.bodyT} width={12} height={c.bodyB - c.bodyT} fill="#F0607A" rx={1} />
        </g>
      ))}
      <rect x={82} y={146} width={16} height={26} rx={2} fill="none" stroke="#26C9A8" strokeWidth={1.5} />
      <line x1={90} y1={140} x2={90} y2={178} stroke="#F0607A" strokeWidth={1} />
      <rect x={83} y={148} width={14} height={22} fill="#F0607A" rx={1} />
      <text x={90} y={192} fontSize={8} fill="#26C9A8" textAnchor="middle" fontWeight={700}>OB↑</text>
      <rect x={82} y={146} width={108} height={26} rx={1} fill="rgba(38,201,168,.07)" stroke="rgba(38,201,168,.28)" strokeWidth={1} strokeDasharray="4 3" />
      {[{ x: 108, bodyT: 126, bodyB: 155, wT: 118, wB: 162 }, { x: 133, bodyT: 98, bodyB: 133, wT: 90, wB: 140 }, { x: 158, bodyT: 72, bodyB: 106, wT: 65, wB: 113 }].map((c, i) => (
        <g key={i}>
          <line x1={c.x + 6} y1={c.wT} x2={c.x + 6} y2={c.wB} stroke="#26C9A8" strokeWidth={1} />
          <rect x={c.x} y={c.bodyT} width={12} height={c.bodyB - c.bodyT} fill="#26C9A8" rx={1} />
        </g>
      ))}
      <path d="M 195 95 L 195 158 M 191 153 L 195 158 L 199 153" fill="none" stroke="rgba(38,201,168,.65)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <text x={197} y={130} fontSize={8} fill="rgba(38,201,168,.7)" fontStyle="italic">retest</text>

      <text x={315} y={18} fontSize={9} fill="#F0607A" textAnchor="middle" fontWeight={700}>BEARISH OB↓</text>
      {[{ x: 222, bodyT: 148, bodyB: 170, wT: 140, wB: 178 }, { x: 250, bodyT: 128, bodyB: 152, wT: 120, wB: 159 }].map((c, i) => (
        <g key={i}>
          <line x1={c.x + 6} y1={c.wT} x2={c.x + 6} y2={c.wB} stroke="#26C9A8" strokeWidth={1} />
          <rect x={c.x} y={c.bodyT} width={12} height={c.bodyB - c.bodyT} fill="#26C9A8" rx={1} />
        </g>
      ))}
      <rect x={274} y={100} width={16} height={28} rx={2} fill="none" stroke="#F0607A" strokeWidth={1.5} />
      <line x1={282} y1={93} x2={282} y2={134} stroke="#26C9A8" strokeWidth={1} />
      <rect x={275} y={102} width={14} height={24} fill="#26C9A8" rx={1} />
      <text x={282} y={92} fontSize={8} fill="#F0607A" textAnchor="middle" fontWeight={700}>OB↓</text>
      <rect x={274} y={100} width={110} height={28} rx={1} fill="rgba(240,96,122,.07)" stroke="rgba(240,96,122,.28)" strokeWidth={1} strokeDasharray="4 3" />
      {[{ x: 300, bodyT: 122, bodyB: 152, wT: 115, wB: 160 }, { x: 325, bodyT: 148, bodyB: 178, wT: 140, wB: 186 }, { x: 350, bodyT: 172, bodyB: 202, wT: 164, wB: 210 }].map((c, i) => (
        <g key={i}>
          <line x1={c.x + 6} y1={c.wT} x2={c.x + 6} y2={c.wB} stroke="#F0607A" strokeWidth={1} />
          <rect x={c.x} y={c.bodyT} width={12} height={c.bodyB - c.bodyT} fill="#F0607A" rx={1} />
        </g>
      ))}
      <path d="M 388 190 L 388 118 M 384 123 L 388 118 L 392 123" fill="none" stroke="rgba(240,96,122,.65)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <text x={390} y={158} fontSize={8} fill="rgba(240,96,122,.7)" fontStyle="italic">retest</text>
    </svg>
  )
}

function DiagramFVG() {
  return (
    <svg viewBox="0 0 420 255" style={{ width: '100%', height: 'auto' }}>
      <line x1={210} y1={8} x2={210} y2={248} stroke="rgba(255,255,255,.07)" strokeWidth={1} />
      <text x={105} y={17} fontSize={9} fill="#26C9A8" textAnchor="middle" fontWeight={700}>BULLISH FVG ↑</text>
      <line x1={58} y1={196} x2={58} y2={220} stroke="#26C9A8" strokeWidth={1} />
      <rect x={52} y={198} width={12} height={18} fill="#26C9A8" rx={1} />
      <line x1={88} y1={110} x2={88} y2={200} stroke="#26C9A8" strokeWidth={1} />
      <rect x={82} y={114} width={12} height={82} fill="#26C9A8" rx={1} />
      <line x1={118} y1={66} x2={118} y2={136} stroke="#26C9A8" strokeWidth={1} />
      <rect x={112} y={70} width={12} height={62} fill="#26C9A8" rx={1} />
      <rect x={52} y={136} width={85} height={60} rx={2} fill="rgba(38,201,168,.15)" stroke="rgba(38,201,168,.4)" strokeWidth={1} strokeDasharray="3 3" />
      <text x={95} y={167} fontSize={9} fill="#26C9A8" textAnchor="middle" fontWeight={700}>FVG</text>
      <text x={95} y={179} fontSize={8} fill="rgba(38,201,168,.65)" textAnchor="middle">C1.high → C3.low</text>
      <text x={58} y={232} fontSize={8} fill="rgba(255,255,255,.3)" textAnchor="middle">C1</text>
      <text x={88} y={232} fontSize={8} fill="rgba(255,255,255,.3)" textAnchor="middle">C2</text>
      <text x={118} y={232} fontSize={8} fill="rgba(255,255,255,.3)" textAnchor="middle">C3</text>
      <path d="M 150 100 L 150 142 M 146 138 L 150 142 L 154 138" fill="none" stroke="rgba(38,201,168,.55)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <text x={174} y={122} fontSize={8} fill="rgba(38,201,168,.65)">fills ↓</text>

      <text x={315} y={17} fontSize={9} fill="#F0607A" textAnchor="middle" fontWeight={700}>BEARISH FVG ↓</text>
      <line x1={265} y1={44} x2={265} y2={70} stroke="#F0607A" strokeWidth={1} />
      <rect x={259} y={46} width={12} height={20} fill="#F0607A" rx={1} />
      <line x1={295} y1={58} x2={295} y2={152} stroke="#F0607A" strokeWidth={1} />
      <rect x={289} y={62} width={12} height={86} fill="#F0607A" rx={1} />
      <line x1={325} y1={116} x2={325} y2={194} stroke="#F0607A" strokeWidth={1} />
      <rect x={319} y={120} width={12} height={70} fill="#F0607A" rx={1} />
      <rect x={259} y={70} width={85} height={46} rx={2} fill="rgba(240,96,122,.15)" stroke="rgba(240,96,122,.4)" strokeWidth={1} strokeDasharray="3 3" />
      <text x={302} y={95} fontSize={9} fill="#F0607A" textAnchor="middle" fontWeight={700}>FVG</text>
      <text x={302} y={107} fontSize={8} fill="rgba(240,96,122,.65)" textAnchor="middle">C3.high → C1.low</text>
      <text x={265} y={210} fontSize={8} fill="rgba(255,255,255,.3)" textAnchor="middle">C1</text>
      <text x={295} y={210} fontSize={8} fill="rgba(255,255,255,.3)" textAnchor="middle">C2</text>
      <text x={325} y={210} fontSize={8} fill="rgba(255,255,255,.3)" textAnchor="middle">C3</text>
      <path d="M 358 152 L 358 104 M 354 109 L 358 104 L 362 109" fill="none" stroke="rgba(240,96,122,.55)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <text x={372} y={130} fontSize={8} fill="rgba(240,96,122,.65)">fills ↑</text>
    </svg>
  )
}

function DiagramBOSChoCH() {
  return (
    <svg viewBox="0 0 420 248" style={{ width: '100%', height: 'auto' }}>
      <line x1={210} y1={8} x2={210} y2={240} stroke="rgba(255,255,255,.07)" strokeWidth={1} />
      <text x={105} y={17} fontSize={10} fill="#A78BFA" textAnchor="middle" fontWeight={700}>CHoCH — Change of Character</text>
      <path d="M 22 48 L 68 140 L 108 102 L 155 168" fill="none" stroke="rgba(240,96,122,.7)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <line x1={68} y1={102} x2={200} y2={102} stroke="rgba(167,139,250,.35)" strokeWidth={1} strokeDasharray="4 3" />
      <path d="M 155 168 L 196 86" fill="none" stroke="#A78BFA" strokeWidth={2.2} strokeLinecap="round" />
      <path d="M 193 90 L 196 86 L 199 91" fill="none" stroke="#A78BFA" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <rect x={130} y={67} width={60} height={18} rx={3} fill="rgba(167,139,250,.18)" stroke="rgba(167,139,250,.5)" strokeWidth={1} />
      <text x={160} y={80} fontSize={9} fill="#A78BFA" textAnchor="middle" fontWeight={800}>CHoCH ↑</text>
      <text x={22} y={44} fontSize={8} fill="rgba(255,255,255,.4)" textAnchor="middle">HH</text>
      <text x={68} y={152} fontSize={8} fill="rgba(255,255,255,.35)" textAnchor="middle">LL</text>
      <text x={108} y={95} fontSize={8} fill="rgba(255,255,255,.35)" textAnchor="middle">LH</text>
      <text x={155} y={180} fontSize={8} fill="rgba(255,255,255,.35)" textAnchor="middle">LL</text>
      <text x={108} y={110} fontSize={8} fill="rgba(167,139,250,.55)">breaks LH</text>
      <text x={105} y={228} fontSize={9} fill="rgba(167,139,250,.65)" textAnchor="middle">First break against trend = reversal signal</text>

      <text x={315} y={17} fontSize={10} fill="#26C9A8" textAnchor="middle" fontWeight={700}>BOS — Break of Structure</text>
      <path d="M 218 202 L 265 125 L 305 158 L 360 82" fill="none" stroke="#26C9A8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <line x1={218} y1={125} x2={410} y2={125} stroke="rgba(38,201,168,.3)" strokeWidth={1} strokeDasharray="4 3" />
      <path d="M 360 82 L 398 54" fill="none" stroke="#26C9A8" strokeWidth={2.2} strokeLinecap="round" />
      <path d="M 395 58 L 398 54 L 401 59" fill="none" stroke="#26C9A8" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <rect x={336} y={56} width={52} height={18} rx={3} fill="rgba(38,201,168,.15)" stroke="rgba(38,201,168,.45)" strokeWidth={1} />
      <text x={362} y={69} fontSize={9} fill="#26C9A8" textAnchor="middle" fontWeight={800}>BOS ↑</text>
      <text x={218} y={215} fontSize={8} fill="rgba(255,255,255,.35)" textAnchor="middle">HL</text>
      <text x={265} y={117} fontSize={8} fill="rgba(255,255,255,.35)" textAnchor="middle">HH</text>
      <text x={305} y={170} fontSize={8} fill="rgba(255,255,255,.35)" textAnchor="middle">HL</text>
      <text x={240} y={119} fontSize={8} fill="rgba(38,201,168,.55)">prev HH</text>
      <text x={315} y={228} fontSize={9} fill="rgba(38,201,168,.65)" textAnchor="middle">Same-direction break = trend confirmation</text>
    </svg>
  )
}

function DiagramLiquidity() {
  return (
    <svg viewBox="0 0 420 252" style={{ width: '100%', height: 'auto' }}>
      <line x1={210} y1={8} x2={210} y2={244} stroke="rgba(255,255,255,.07)" strokeWidth={1} />
      <text x={105} y={17} fontSize={9} fill="#E8A020" textAnchor="middle" fontWeight={700}>BUY SIDE LIQUIDITY (BSL)</text>
      <line x1={25} y1={95} x2={190} y2={95} stroke="rgba(232,160,32,.5)" strokeWidth={1.5} strokeDasharray="5 3" />
      <text x={15} y={99} fontSize={8} fill="rgba(232,160,32,.8)" textAnchor="end">BSL</text>
      <path d="M 30 178 L 58 95 L 85 148 L 112 96 L 140 150 L 165 96" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 165 96 L 172 60 L 178 200" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <line x1={172} y1={60} x2={172} y2={48} stroke="rgba(232,160,32,.7)" strokeWidth={1} />
      <rect x={142} y={36} width={72} height={14} rx={2} fill="rgba(232,160,32,.18)" stroke="rgba(232,160,32,.4)" strokeWidth={1} />
      <text x={178} y={46} fontSize={8} fill="#E8A020" textAnchor="middle" fontWeight={700}>SWEEP ↑</text>
      <path d="M 178 200 L 184 218" fill="none" stroke="#F0607A" strokeWidth={2} strokeLinecap="round" />
      <path d="M 181 214 L 184 218 L 187 214" fill="none" stroke="#F0607A" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <text x={105} y={238} fontSize={8} fill="#F0607A" textAnchor="middle">Reversal after sweep</text>

      <text x={315} y={17} fontSize={9} fill="#5B9CF6" textAnchor="middle" fontWeight={700}>SELL SIDE LIQUIDITY (SSL)</text>
      <line x1={220} y1={175} x2={390} y2={175} stroke="rgba(91,156,246,.5)" strokeWidth={1.5} strokeDasharray="5 3" />
      <text x={396} y={179} fontSize={8} fill="rgba(91,156,246,.8)">SSL</text>
      <path d="M 225 90 L 248 175 L 274 120 L 300 176 L 326 122 L 350 175" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 350 175 L 358 212 L 364 58" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <line x1={358} y1={212} x2={358} y2={224} stroke="rgba(91,156,246,.7)" strokeWidth={1} />
      <rect x={328} y={222} width={72} height={14} rx={2} fill="rgba(91,156,246,.18)" stroke="rgba(91,156,246,.4)" strokeWidth={1} />
      <text x={364} y={232} fontSize={8} fill="#5B9CF6" textAnchor="middle" fontWeight={700}>SWEEP ↓</text>
      <path d="M 364 78 L 369 44" fill="none" stroke="#26C9A8" strokeWidth={2} strokeLinecap="round" />
      <path d="M 366 48 L 369 44 L 372 48" fill="none" stroke="#26C9A8" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <text x={315} y={238} fontSize={8} fill="#26C9A8" textAnchor="middle">Reversal after sweep</text>
    </svg>
  )
}

function DiagramPremiumDiscount() {
  const bx = 90, bT = 22, bB = 232, bH = bB - bT, bW = 50
  const eq = bT + bH * 0.5
  const g618 = bT + bH * 0.382
  return (
    <svg viewBox="0 0 420 258" style={{ width: '100%', height: 'auto' }}>
      <rect x={bx} y={bT} width={bW} height={bH / 2} rx={3} fill="rgba(240,96,122,.2)" stroke="rgba(240,96,122,.4)" strokeWidth={1} />
      <rect x={bx} y={eq} width={bW} height={bH / 2} rx={3} fill="rgba(38,201,168,.2)" stroke="rgba(38,201,168,.4)" strokeWidth={1} />
      <rect x={bx} y={g618} width={bW} height={bH * 0.12} rx={1} fill="rgba(232,160,32,.35)" stroke="rgba(232,160,32,.6)" strokeWidth={1} />
      <text x={bx - 6} y={bT + 12} fontSize={9} fill="rgba(240,96,122,.9)" textAnchor="end" fontWeight={700}>100%</text>
      <text x={bx - 6} y={bT + bH * 0.18} fontSize={8} fill="rgba(240,96,122,.7)" textAnchor="end">PREMIUM</text>
      <text x={bx - 6} y={bT + bH * 0.25} fontSize={8} fill="rgba(240,96,122,.45)" textAnchor="end">Sell zone</text>
      <text x={bx - 6} y={eq - 3} fontSize={9} fill="rgba(255,255,255,.7)" textAnchor="end" fontWeight={700}>50%</text>
      <text x={bx - 6} y={g618 + 7} fontSize={8} fill="rgba(232,160,32,.85)" textAnchor="end" fontWeight={700}>61.8%</text>
      <text x={bx - 6} y={bT + bH * 0.78} fontSize={8} fill="rgba(38,201,168,.7)" textAnchor="end">DISCOUNT</text>
      <text x={bx - 6} y={bT + bH * 0.85} fontSize={8} fill="rgba(38,201,168,.45)" textAnchor="end">Buy zone</text>
      <text x={bx - 6} y={bB} fontSize={9} fill="rgba(38,201,168,.9)" textAnchor="end" fontWeight={700}>0%</text>
      <line x1={bx} y1={eq} x2={bx + bW + 140} y2={eq} stroke="rgba(255,255,255,.3)" strokeWidth={1} strokeDasharray="4 3" />
      <line x1={bx} y1={g618} x2={bx + bW + 140} y2={g618} stroke="rgba(232,160,32,.45)" strokeWidth={1} strokeDasharray="3 3" />
      <text x={bx + bW + 6} y={eq + 4} fontSize={8} fill="rgba(255,255,255,.55)">Equilibrium</text>
      <text x={bx + bW + 6} y={g618 + 4} fontSize={8} fill="rgba(232,160,32,.8)" fontWeight={700}>Golden Zone</text>
      <text x={bx + bW / 2} y={bT - 6} fontSize={9} fill="rgba(255,255,255,.65)" textAnchor="middle">Swing High</text>
      <text x={bx + bW / 2} y={bB + 14} fontSize={9} fill="rgba(255,255,255,.65)" textAnchor="middle">Swing Low</text>
      <text x={260} y={20} fontSize={9} fill="rgba(255,255,255,.55)" textAnchor="middle" fontWeight={700}>ENTRY LOGIC</text>
      <rect x={210} y={eq + 18} width={100} height={22} rx={4} fill="rgba(38,201,168,.12)" stroke="rgba(38,201,168,.35)" strokeWidth={1} />
      <text x={260} y={eq + 33} fontSize={10} fill="#26C9A8" textAnchor="middle" fontWeight={700}>BUY — Discount</text>
      <rect x={210} y={eq - 42} width={100} height={22} rx={4} fill="rgba(240,96,122,.12)" stroke="rgba(240,96,122,.35)" strokeWidth={1} />
      <text x={260} y={eq - 27} fontSize={10} fill="#F0607A" textAnchor="middle" fontWeight={700}>SELL — Premium</text>
      <rect x={210} y={g618 + 2} width={100} height={18} rx={4} fill="rgba(232,160,32,.15)" stroke="rgba(232,160,32,.4)" strokeWidth={1} />
      <text x={260} y={g618 + 14} fontSize={9} fill="#E8A020" textAnchor="middle" fontWeight={700}>Best OB entries</text>
    </svg>
  )
}

/* ── SMC Section components ──────────────────────────────────────────────── */

function SectionSmcStruct() {
  return (
    <G2
      caption="Bullish structure — each swing low (HL) is higher than the last, each swing high (HH) is higher than the last"
      left={
        <>
          <p className="edu-p">Market structure is the foundation of SMC analysis. Price never moves randomly — it forms a sequence of swing highs and swing lows that reveal the underlying institutional trend.</p>
          <div className="edu-table-wrap">
            <table className="edu-table">
              <thead><tr><th>Label</th><th>Meaning</th><th>Context</th></tr></thead>
              <tbody>
                <tr><td style={{ color: '#86EFAC', fontWeight: 700 }}>HH</td><td>Higher High</td><td>Peak above prior peak → bullish</td></tr>
                <tr><td style={{ color: '#26C9A8', fontWeight: 700 }}>HL</td><td>Higher Low</td><td>Trough above prior trough → bullish</td></tr>
                <tr><td style={{ color: '#FCA5A5', fontWeight: 700 }}>LH</td><td>Lower High</td><td>Peak below prior peak → bearish</td></tr>
                <tr><td style={{ color: '#F0607A', fontWeight: 700 }}>LL</td><td>Lower Low</td><td>Trough below prior trough → bearish</td></tr>
              </tbody>
            </table>
          </div>
          <ICard title="Reading Swing Points" color="teal">
            <p>A swing high needs at least one lower candle on each side. A swing low needs at least one higher candle on each side. NubraOSS uses a 5-candle lookback by default — tunable per timeframe.</p>
          </ICard>
          <ICard title="In NubraOSS SMC Dashboard">
            <div className="edu-kv">
              <span className="edu-kv-k">BULLISH</span><span>Confirmed HH + HL sequence</span>
              <span className="edu-kv-k">BEARISH</span><span>Confirmed LH + LL sequence</span>
              <span className="edu-kv-k">RANGING</span><span>Mixed — no clear directional sequence</span>
            </div>
          </ICard>
        </>
      }
      right={<DiagramSMCStructure />}
    />
  )
}

function SectionSmcOB() {
  return (
    <G2
      caption="OB↑ = last bearish candle before bullish impulse. OB↓ = last bullish candle before bearish impulse."
      left={
        <>
          <p className="edu-p">An Order Block is the last opposing candle before a strong impulse move. It marks where institutional orders were placed — and price tends to return to that zone for a retest before continuing.</p>
          <TagRow items={[
            { label: 'OB↑ — last red candle before big green', color: 'green' },
            { label: 'OB↓ — last green candle before big red',  color: 'red' },
          ]} />
          <ICard title="Why Order Blocks Work" color="teal">
            <p>Institutions can't fill an entire position in one candle. Remaining unfilled orders sit in the OB zone. When price returns, those orders execute — creating a predictable bounce or rejection.</p>
          </ICard>
          <ICard title="OB Zone Boundaries">
            <div className="edu-kv">
              <span className="edu-kv-k">High</span><span>Top of the OB candle body (or wick)</span>
              <span className="edu-kv-k">Low</span><span>Bottom of the OB candle body (or wick)</span>
              <span className="edu-kv-k">50% body mid</span><span>Highest-probability retest entry point</span>
            </div>
          </ICard>
          <ICard title="Mitigation" color="amber">
            <p>Once price retests the OB and continues in the impulse direction, the OB is "mitigated" — it loses effectiveness and should not be traded again as a primary signal.</p>
          </ICard>
        </>
      }
      right={<DiagramOrderBlocks />}
    />
  )
}

function SectionSmcFVG() {
  return (
    <G2
      caption="Bullish FVG: C1.high < C3.low — no two-way auction occurred in that price range during the impulse candle"
      left={
        <>
          <p className="edu-p">A Fair Value Gap (FVG) is a 3-candle imbalance where price moves so fast that a gap remains — no two-way auction happened in that range. Markets seek to fill this inefficiency.</p>
          <Fml>{'Bullish FVG: C1.high < C3.low  (gap above)'}</Fml>
          <Fml>{'Bearish FVG: C1.low > C3.high  (gap below)'}</Fml>
          <ICard title="Why FVGs Fill" color="teal">
            <p>Markets seek price efficiency. A one-sided auction (no counter-party) eventually attracts opposing orders. Price is drawn back to the FVG zone before continuing the trend — making it a high-probability entry area.</p>
          </ICard>
          <ICard title="FVG Entry Tiers">
            <div className="edu-kv">
              <span className="edu-kv-k">50% of FVG</span><span>Equilibrium of the gap — best entry</span>
              <span className="edu-kv-k">Full gap entry</span><span>Any price inside the FVG zone is valid</span>
              <span className="edu-kv-k">Unfilled FVG</span><span>Still active — acts as a price magnet</span>
              <span className="edu-kv-k">Filled FVG</span><span>Fully covered — zone is neutralized</span>
            </div>
          </ICard>
          <ICard title="In NubraOSS Dashboard" color="amber">
            <p>Active FVGs shown as FVG↑ / FVG↓ on the right price axis with dotted lines. The top 6 most recent zones are displayed per timeframe.</p>
          </ICard>
        </>
      }
      right={<DiagramFVG />}
    />
  )
}

function SectionSmcBOS() {
  return (
    <G2
      caption="CHoCH: price breaks a swing point against the trend (early reversal). BOS: price breaks with the trend (continuation)."
      left={
        <>
          <p className="edu-p">BOS and CHoCH are the primary signals in SMC — they tell you whether price is confirming the current trend or warning of a reversal. Every significant market move begins with a CHoCH.</p>
          <div className="edu-table-wrap">
            <table className="edu-table">
              <thead><tr><th>Signal</th><th>What breaks</th><th>Implication</th></tr></thead>
              <tbody>
                <tr><td style={{ color: '#26C9A8', fontWeight: 700 }}>BOS ↑</td><td>Previous swing high</td><td>Uptrend confirmed — look for long entries on pullback</td></tr>
                <tr><td style={{ color: '#F0607A', fontWeight: 700 }}>BOS ↓</td><td>Previous swing low</td><td>Downtrend confirmed — look for short entries on bounce</td></tr>
                <tr><td style={{ color: '#A78BFA', fontWeight: 700 }}>CHoCH ↑</td><td>Swing high in downtrend</td><td>Possible bullish reversal — wait for confirmation</td></tr>
                <tr><td style={{ color: '#A78BFA', fontWeight: 700 }}>CHoCH ↓</td><td>Swing low in uptrend</td><td>Possible bearish reversal — wait for confirmation</td></tr>
              </tbody>
            </table>
          </div>
          <ICard title="Entry Sequence" color="amber">
            <p>CHoCH alone is not enough. Wait for: <strong>CHoCH → pullback forms HL → first BOS in new direction</strong>. This three-step confirmation gives the highest-probability entry with the new institutional trend.</p>
          </ICard>
          <ICard title="In NubraOSS Dashboard" color="teal">
            <p>BOS / CHoCH levels appear as dashed lines on the right axis. The Structure Trend badge (BULLISH / BEARISH / RANGING) and Confluence Score update in real-time as new signals form.</p>
          </ICard>
        </>
      }
      right={<DiagramBOSChoCH />}
    />
  )
}

function SectionSmcLiq() {
  return (
    <G2
      caption="BSL = stops above equal highs. SSL = stops below equal lows. Smart money sweeps before making the real move."
      left={
        <>
          <p className="edu-p">Liquidity pools are clusters of stop-loss orders at obvious price levels. Smart money (institutions) deliberately hunt these pools before executing their real position — sweeping stops to fill their orders at better prices.</p>
          <TagRow items={[
            { label: 'BSL — Buy Side: stops above equal highs', color: 'amber' },
            { label: 'SSL — Sell Side: stops below equal lows',  color: 'teal' },
          ]} />
          <ICard title="Where Liquidity Pools Form">
            <div className="edu-kv">
              <span className="edu-kv-k">Equal highs</span><span>Multiple wicks at the same level → BSL above</span>
              <span className="edu-kv-k">Equal lows</span><span>Multiple wicks at the same level → SSL below</span>
              <span className="edu-kv-k">Previous HH / LL</span><span>Retail stops cluster at obvious swing points</span>
              <span className="edu-kv-k">Round numbers</span><span>24000, 24500 — natural stop magnets</span>
            </div>
          </ICard>
          <ICard title="The Sweep Signal" color="amber">
            <p>A sweep = wick above/below the liquidity pool with close back inside the range. This signature — institutions absorbing stops and reversing — combined with an OB or FVG in the sweep zone is a very high-probability setup.</p>
          </ICard>
          <ICard title="In NubraOSS Dashboard" color="teal">
            <p>BSL appears as amber dashed lines above current price. SSL appears as blue dashed lines below. Scanner signals fire when a sweep occurs: liquidity taken + reversal candle within the same bar.</p>
          </ICard>
        </>
      }
      right={<DiagramLiquidity />}
    />
  )
}

function SectionSmcPD() {
  return (
    <G2
      caption="Premium (above 50%) = expensive — prefer shorts. Discount (below 50%) = cheap — prefer longs. Golden Zone at 61.8% is best for OB entries."
      left={
        <>
          <p className="edu-p">Every price swing creates a range. Premium/Discount divides this range at the 50% equilibrium to identify where it is cheap to buy (discount) and expensive to sell (premium).</p>
          <Fml>{'Equilibrium = (Swing High + Swing Low) / 2'}</Fml>
          <div className="edu-table-wrap">
            <table className="edu-table">
              <thead><tr><th>Zone</th><th>Range</th><th>Bias</th></tr></thead>
              <tbody>
                <tr><td style={{ color: '#F0607A', fontWeight: 700 }}>Premium</td><td>50 – 100%</td><td>Look for short setups, avoid longs</td></tr>
                <tr><td style={{ color: '#E8A020', fontWeight: 700 }}>Golden Zone</td><td>61.8 – 78.6%</td><td>Best OB + FVG confluence entries</td></tr>
                <tr><td style={{ color: '#8A96B8', fontWeight: 700 }}>Equilibrium</td><td>50%</td><td>Neutral — wait for directional signal</td></tr>
                <tr><td style={{ color: '#26C9A8', fontWeight: 700 }}>Discount</td><td>0 – 50%</td><td>Look for long setups, avoid shorts</td></tr>
              </tbody>
            </table>
          </div>
          <ICard title="Combining with OBs and FVGs" color="teal">
            <p>The highest-probability setups form when a bullish OB or FVG sits inside the Discount zone. Similarly, bearish OBs in the Premium zone. This Price/Zone alignment is the core SMC entry model.</p>
          </ICard>
          <ICard title="The Golden Zone" color="amber">
            <p>The 61.8%–78.6% retracement of a swing (Fibonacci) is where institutional OBs concentrate most often. This is the signature SMC entry zone — maximum reward-to-risk with structural backing.</p>
          </ICard>
        </>
      }
      right={<DiagramPremiumDiscount />}
    />
  )
}

function SmcSectionContent({ id }: { id: string }) {
  switch (id) {
    case 'smc-struct': return <SectionSmcStruct />
    case 'smc-ob':     return <SectionSmcOB />
    case 'smc-fvg':    return <SectionSmcFVG />
    case 'smc-bos':    return <SectionSmcBOS />
    case 'smc-liq':    return <SectionSmcLiq />
    case 'smc-pd':     return <SectionSmcPD />
    default:           return null
  }
}

/* ── SmcAcademy ──────────────────────────────────────────────────────────── */
function SmcAcademy({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const [idx, setIdx] = useState(0)
  const section = SMC_SECTIONS[idx]
  return (
    <div className="edu-root">
      <div className="edu-header">
        <div className="edu-header-left">
          <span className="edu-header-title">Academy</span>
          <span className="edu-header-sep">/</span>
          <span className="edu-header-sub">Smart Money Concepts</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="edu-back-btn" onClick={onBack}>← All Modules</button>
          <button className="edu-close" onClick={onClose}>Close</button>
        </div>
      </div>
      <div className="edu-layout">
        <nav className="edu-sidebar">
          {SMC_SECTIONS.map((s, i) => (
            <button key={s.id} className={`edu-nav-item${i === idx ? ' active' : ''}`} onClick={() => setIdx(i)}>
              <span className="edu-nav-num">{i + 1}</span>
              <span>{s.title}</span>
            </button>
          ))}
        </nav>
        <main className="edu-main">
          <div className="edu-section-header">
            <div className="edu-section-pre">{String(idx + 1).padStart(2, '0')} of {SMC_SECTIONS.length}</div>
            <h2 className="edu-section-title">{section.title}</h2>
            <div className="edu-section-sub">{section.sub}</div>
          </div>
          <SmcSectionContent id={section.id} />
        </main>
      </div>
      <div className="edu-footer">
        <button className="btn-ghost" disabled={idx === 0} onClick={() => setIdx(i => Math.max(0, i - 1))}>Previous</button>
        <div className="edu-footer-dots">
          {SMC_SECTIONS.map((_, i) => (
            <span key={i} className={`edu-dot${i === idx ? ' active' : ''}`} onClick={() => setIdx(i)} />
          ))}
        </div>
        {idx < SMC_SECTIONS.length - 1
          ? <button className="btn-primary" onClick={() => setIdx(i => i + 1)}>Next</button>
          : <button className="btn-primary" onClick={onClose}>Enter Dashboard</button>}
      </div>
    </div>
  )
}

/* ── GreeksContent ───────────────────────────────────────────────────────── */
function GreeksContent({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const [idx, setIdx] = useState(0)
  const section = SECTIONS[idx]
  return (
    <div className="edu-root">
      <div className="edu-header">
        <div className="edu-header-left">
          <span className="edu-header-title">Academy</span>
          <span className="edu-header-sep">/</span>
          <span className="edu-header-sub">Options Intelligence Guide</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="edu-back-btn" onClick={onBack}>← All Modules</button>
          <button className="edu-close" onClick={onClose}>Close</button>
        </div>
      </div>
      <div className="edu-layout">
        <nav className="edu-sidebar">
          {SECTIONS.map((s, i) => (
            <button key={s.id} className={`edu-nav-item${i === idx ? ' active' : ''}`} onClick={() => setIdx(i)}>
              <span className="edu-nav-num">{i + 1}</span>
              <span>{s.title}</span>
            </button>
          ))}
        </nav>
        <main className="edu-main">
          <div className="edu-section-header">
            <div className="edu-section-pre">{String(idx + 1).padStart(2, '0')} of {SECTIONS.length}</div>
            <h2 className="edu-section-title">{section.title}</h2>
            <div className="edu-section-sub">{section.sub}</div>
          </div>
          <SectionContent id={section.id} />
        </main>
      </div>
      <div className="edu-footer">
        <button className="btn-ghost" disabled={idx === 0} onClick={() => setIdx(i => Math.max(0, i - 1))}>Previous</button>
        <div className="edu-footer-dots">
          {SECTIONS.map((_, i) => (
            <span key={i} className={`edu-dot${i === idx ? ' active' : ''}`} onClick={() => setIdx(i)} />
          ))}
        </div>
        {idx < SECTIONS.length - 1
          ? <button className="btn-primary" onClick={() => setIdx(i => i + 1)}>Next</button>
          : <button className="btn-primary" onClick={onClose}>Enter Dashboard</button>}
      </div>
    </div>
  )
}

/* ── AcademyLanding ──────────────────────────────────────────────────────── */
function AcademyLanding({ onSelect, onClose }: {
  onSelect: (v: 'greeks' | 'smc') => void
  onClose: () => void
}) {
  return (
    <div className="edu-root">
      <div className="edu-header">
        <div className="edu-header-left">
          <span className="edu-header-title">Academy</span>
          <span className="edu-header-sep">/</span>
          <span className="edu-header-sub">Choose a module to begin</span>
        </div>
        <button className="edu-close" onClick={onClose}>Close</button>
      </div>
      <div className="edu-landing">
        <div style={{ textAlign: 'center' }}>
          <div className="edu-landing-title">NubraOSS Academy</div>
          <div className="edu-landing-sub">Interactive guides for options and smart money trading</div>
        </div>
        <div className="edu-module-grid">
          <button className="edu-module-tile edu-module-tile-greeks" onClick={() => onSelect('greeks')}>
            <div className="edu-module-icon">📊</div>
            <div className="edu-module-name">Options &amp; Greeks</div>
            <div className="edu-module-desc">Understand options payoffs, OI dynamics, implied volatility, and all five Greeks — plus GEX, key levels, and the signal pipeline.</div>
            <div className="edu-module-topics">
              {['CE/PE Basics', 'Open Interest', 'PCR', 'IV & Crush', 'Δ Γ θ ν', 'GEX', 'Key Levels', 'Signals'].map(t => (
                <span key={t} className="edu-module-topic">{t}</span>
              ))}
            </div>
            <div className="edu-module-cta">Explore module →</div>
          </button>
          <button className="edu-module-tile edu-module-tile-smc" onClick={() => onSelect('smc')}>
            <div className="edu-module-icon">🏦</div>
            <div className="edu-module-name">Smart Money Concepts</div>
            <div className="edu-module-desc">Learn how institutions move markets — from structure and order blocks to liquidity sweeps and premium/discount zones with live visualizers.</div>
            <div className="edu-module-topics">
              {['Market Structure', 'Order Blocks', 'FVG', 'BOS & CHoCH', 'Liquidity', 'Premium/Discount'].map(t => (
                <span key={t} className="edu-module-topic">{t}</span>
              ))}
            </div>
            <div className="edu-module-cta">Explore module →</div>
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Main Component ──────────────────────────────────────────────────────── */
export default function EducationPage({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<'landing' | 'greeks' | 'smc'>('landing')
  if (view === 'greeks') return <GreeksContent onBack={() => setView('landing')} onClose={onClose} />
  if (view === 'smc')    return <SmcAcademy   onBack={() => setView('landing')} onClose={onClose} />
  return <AcademyLanding onSelect={setView} onClose={onClose} />
}
