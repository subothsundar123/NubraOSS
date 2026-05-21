import WidgetFrame from '../dashboard/WidgetFrame'
import type { CommentaryItem } from '../../positioning/types'

export default function CommentaryRail({ commentary }: { commentary?: CommentaryItem[] }) {
  const items = commentary ?? []
  return (
    <WidgetFrame title="Market Narrative" kicker="What changed">
      <div className="positioning-rail positioning-desk-feed">
        {items.length === 0 ? (
          <div className="positioning-empty terminal">
            <strong>Building market narrative</strong>
            <span>Awaiting regime, participation, and sector transition evidence.</span>
          </div>
        ) : null}
        {items.map((item) => (
          <article key={item.id} className={`positioning-rail-item ${item.severity}`}>
            <div className="positioning-rail-title">
              <span className="positioning-feed-time">{new Date(item.created_at).toLocaleTimeString()}</span>
              <strong>{item.title}</strong>
            </div>
            <p>{item.message}</p>
            <div className="positioning-chip-row">{item.tags.slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}</div>
          </article>
        ))}
      </div>
    </WidgetFrame>
  )
}
