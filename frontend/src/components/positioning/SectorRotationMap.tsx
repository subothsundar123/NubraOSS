import type React from 'react'

import WidgetFrame from '../dashboard/WidgetFrame'
import InfoTip from '../InfoTip'
import type { SectorRotationSnapshot } from '../../positioning/types'

function color(strength: number): string {
  if (strength >= 65) return 'linear-gradient(135deg, rgba(124,207,94,.64), rgba(32,90,54,.42))'
  if (strength <= 40) return 'linear-gradient(135deg, rgba(241,66,66,.62), rgba(97,24,34,.42))'
  return 'linear-gradient(135deg, rgba(120,201,255,.28), rgba(18,50,74,.38))'
}

export default function SectorRotationMap({ sectorRotation }: { sectorRotation?: SectorRotationSnapshot }) {
  const sectors = sectorRotation?.sectors ?? []
  return (
    <WidgetFrame title="Sector Rotation" kicker="Leadership heat" className="positioning-widget-wide positioning-widget-heatmap" info="sector_rotation">
      <div className="positioning-sector-map">
        {sectors.length === 0 ? (
          <div className="positioning-empty terminal">
            <strong>Syncing sector participation</strong>
            <span>Waiting for enough scanner rows to rank leadership and concentration.</span>
          </div>
        ) : null}
        {sectors.map((sector, index) => (
          <div
            key={sector.sector}
            className="positioning-sector-tile"
            style={{
              background: color(sector.strength),
              '--sector-strength': `${Math.max(0, Math.min(100, sector.strength))}%`,
              '--sector-breadth': `${Math.max(0, Math.min(100, sector.breadth_pct))}%`,
            } as React.CSSProperties}
          >
            <div className="positioning-sector-top">
              <strong>{sector.sector}</strong>
              <em>#{index + 1}</em>
            </div>
            <div className="positioning-sector-score">
              <span>{sector.strength.toFixed(1)}</span>
              <i><b /></i>
            </div>
            <div className="positioning-sector-meta">
              <small>{sector.avg_change_pct >= 0 ? '+' : ''}{sector.avg_change_pct.toFixed(2)}%</small>
              <small>{sector.avg_volume_ratio.toFixed(2)}x vol</small>
              <small>{sector.breadth_pct.toFixed(0)}% breadth <InfoTip term="breadth" /></small>
            </div>
          </div>
        ))}
      </div>
    </WidgetFrame>
  )
}
