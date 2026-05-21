import WidgetFrame from '../dashboard/WidgetFrame'
import type { AlertItem } from '../../positioning/types'

export default function AlertRail({ alerts }: { alerts?: AlertItem[] }) {
  const items = alerts ?? []
  return (
    <WidgetFrame title="Action Rail" kicker="Ranked alerts">
      <div className="positioning-rail compact">
        {items.length === 0 ? (
          <div className="positioning-empty terminal">
            <strong>No high-conviction alerts</strong>
            <span>Monitoring thrust, control shifts, concentration risk, and acceptance failures.</span>
          </div>
        ) : null}
        {items.map((item) => (
          <article key={item.id} className={`positioning-rail-item ${item.severity}`}>
            <div className="positioning-rail-title">
              <strong>{item.title}</strong>
              <span className="positioning-alert-severity">{item.severity}</span>
            </div>
            <p>{item.message}</p>
            <small>{new Date(item.created_at).toLocaleTimeString()}</small>
          </article>
        ))}
      </div>
    </WidgetFrame>
  )
}
