import type React from 'react'
import InfoTip from '../InfoTip'

export function metricTone(score?: number): 'positive' | 'negative' | 'neutral' {
  if ((score ?? 50) >= 60) return 'positive'
  if ((score ?? 50) <= 40) return 'negative'
  return 'neutral'
}

export function formatScore(value: number | null | undefined): string {
  return Number.isFinite(value ?? Number.NaN) ? Number(value).toFixed(1) : '--'
}

export function ConfidenceBar({ value }: { value: number }) {
  return (
    <div className="positioning-confidence-bar" aria-label={`Confidence ${formatScore(value)}`}>
      <i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}

export function StatusRing({ value, tone = 'neutral' }: { value: number; tone?: 'positive' | 'negative' | 'neutral' }) {
  const clamped = Math.max(0, Math.min(100, value))
  return <span className={`positioning-status-ring ${tone}`} style={{ '--ring': `${clamped * 3.6}deg` } as React.CSSProperties} />
}

export function LiveIndicator({ live }: { live: boolean }) {
  return <span className={`positioning-live-indicator ${live ? 'is-live' : ''}`}>{live ? 'Live' : 'Stale'}</span>
}

export function DirectionBadge({ direction }: { direction?: string }) {
  return <span className={`positioning-direction-badge ${direction ?? 'neutral'}`}>{direction ?? 'neutral'}</span>
}

export function ScorePill({ value }: { value?: number }) {
  const score = value ?? 0
  return <span className={`positioning-score-pill ${metricTone(score)}`}>{formatScore(score)}</span>
}

export function SignalChip({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'positive' | 'negative' | 'neutral' }) {
  return <span className={`positioning-signal-chip ${tone}`}>{children}</span>
}

export default function MetricTile({
  label,
  value,
  detail,
  score,
  confidence,
  large = false,
  info,
}: {
  label: string
  value: React.ReactNode
  detail?: React.ReactNode
  score?: number
  confidence?: number
  large?: boolean
  info?: string
}) {
  const tone = metricTone(score)
  return (
    <div className={`positioning-metric-tile ${tone} ${large ? 'is-large' : ''}`}>
      <div className="positioning-metric-top">
        <span>{label}{info ? <InfoTip term={info} /> : null}</span>
        {typeof confidence === 'number' ? <StatusRing value={confidence} tone={tone} /> : null}
      </div>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
      {typeof confidence === 'number' ? <ConfidenceBar value={confidence} /> : null}
    </div>
  )
}
