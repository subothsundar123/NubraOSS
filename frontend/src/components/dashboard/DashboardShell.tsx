import React from 'react'

export default function DashboardShell({
  children,
  eyebrow,
  title,
  subtitle,
}: {
  children: React.ReactNode
  eyebrow: string
  title: string
  subtitle: string
}) {
  return (
    <main className="positioning-shell">
      <section className="positioning-hero">
        <div>
          <span className="positioning-eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </section>
      {children}
    </main>
  )
}
