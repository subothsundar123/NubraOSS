import type React from 'react'

export default function RealtimeTable({
  columns,
  children,
  className = '',
}: {
  columns: string[]
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`positioning-realtime-table ${className}`.trim()}>
      <div className="positioning-rt-row positioning-rt-head">
        {columns.map((column) => <span key={column}>{column}</span>)}
      </div>
      {children}
    </div>
  )
}
