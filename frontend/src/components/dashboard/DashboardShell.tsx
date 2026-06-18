import React from 'react'

export default function DashboardShell({
  children,
  eyebrow,
  title,
  subtitle,
  headerExtra,
}: {
  children: React.ReactNode
  eyebrow: string
  title: string
  subtitle: string
  headerExtra?: React.ReactNode
}) {
  return (
    <main className="positioning-shell">
      <section className="positioning-hero">
        <div>
          <span className="positioning-eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {headerExtra && <div className="positioning-hero-extra">{headerExtra}</div>}
      </section>
      {children}
    </main>
  )
}
