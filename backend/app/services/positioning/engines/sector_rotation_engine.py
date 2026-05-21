from __future__ import annotations

from collections import defaultdict
from typing import Any

from app.services.positioning.contracts import PositioningScore, SectorRotationSnapshot, neutral_score


class SectorRotationEngine:
    def compute(self, context: dict[str, Any]) -> SectorRotationSnapshot:
        rows = [row for row in list(context.get("market_rows") or []) if row.get("sector")]
        if not rows:
            return SectorRotationSnapshot(score=neutral_score("Sector metadata is not available yet.", stale=True))

        grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in rows:
            grouped[str(row.get("sector"))].append(row)

        sectors = []
        for sector, items in grouped.items():
            avg_change = sum(float(item.get("day_change_pct") or item.get("price_change_pct") or 0) for item in items) / max(1, len(items))
            avg_volume_ratio = sum(float(item.get("volume_ratio") or 0) for item in items) / max(1, len(items))
            advancing = sum(1 for item in items if float(item.get("day_change_pct") or item.get("price_change_pct") or 0) > 0)
            breadth = advancing / max(1, len(items))
            strength = max(0, min(100, 50 + avg_change * 8 + (avg_volume_ratio - 1) * 16 + (breadth - 0.5) * 40))
            sectors.append(
                {
                    "sector": sector,
                    "strength": round(strength, 1),
                    "avg_change_pct": round(avg_change, 2),
                    "avg_volume_ratio": round(avg_volume_ratio, 2),
                    "breadth_pct": round(breadth * 100, 1),
                    "symbols": len(items),
                }
            )

        sectors.sort(key=lambda item: item["strength"], reverse=True)
        leadership = [item["sector"] for item in sectors[:3]]
        concentration = round(sum(item["strength"] for item in sectors[:3]) / max(1, sum(item["strength"] for item in sectors)) * 100, 1)
        score_value = round(sum(item["strength"] for item in sectors[:5]) / max(1, min(5, len(sectors))), 1)
        direction = "bullish" if score_value >= 58 else "bearish" if score_value <= 42 else "mixed"

        return SectorRotationSnapshot(
            score=PositioningScore(
                score=score_value,
                direction=direction,
                confidence=min(85, 40 + len(sectors) * 5),
                components={"top_sector_strength": sectors[0]["strength"], "concentration_score": concentration},
                explanation=[
                    f"{leadership[0]} is the strongest active sector." if leadership else "No sector leadership detected.",
                    f"Top-three concentration is {concentration}%.",
                ],
            ),
            sectors=sectors[:12],
            leadership=leadership,
            concentration_score=concentration,
        )
