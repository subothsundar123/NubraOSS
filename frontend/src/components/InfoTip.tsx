import { useEffect, useRef, useState } from 'react'
import { GLOSSARY } from '../glossary'

export default function InfoTip({ term }: { term: string }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const entry = GLOSSARY[term]

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!entry) return null

  return (
    <span className="info-tip-wrap" ref={wrapRef}>
      <button
        className="info-tip-btn"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        aria-label={`What is ${entry.label}?`}
        aria-expanded={open}
        type="button"
      >
        i
      </button>
      {open && (
        <span className="info-tip-popover" role="tooltip">
          <strong>{entry.label}</strong>
          <p>{entry.body}</p>
          {entry.example ? <em>{entry.example}</em> : null}
        </span>
      )}
    </span>
  )
}
