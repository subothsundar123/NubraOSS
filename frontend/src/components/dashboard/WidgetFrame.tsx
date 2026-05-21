import React from 'react'
import InfoTip from '../InfoTip'

export default function WidgetFrame({
  title,
  kicker,
  children,
  className = '',
  right,
  info,
}: {
  title: string
  kicker?: string
  children: React.ReactNode
  className?: string
  right?: React.ReactNode
  info?: string
}) {
  return (
    <article className={`positioning-widget ${className}`.trim()}>
      <header className="positioning-widget-head">
        <div>
          {kicker ? <span>{kicker}</span> : null}
          <h2>{title}{info ? <InfoTip term={info} /> : null}</h2>
        </div>
        {right ? <div className="positioning-widget-right">{right}</div> : null}
      </header>
      {children}
    </article>
  )
}
