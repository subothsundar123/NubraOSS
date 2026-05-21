from __future__ import annotations

from typing import Any

from app.services.positioning.contracts import BreadthSnapshot, PositioningScore, neutral_score


class BreadthEngine:
    def compute(self, context: dict[str, Any]) -> BreadthSnapshot:
        rows = list(context.get("market_rows") or [])
        if not rows:
            return BreadthSnapshot(score=neutral_score("No scanner rows are available yet.", stale=True))

        advances = sum(1 for row in rows if float(row.get("day_change_pct") or row.get("price_change_pct") or 0) > 0)
        declines = sum(1 for row in rows if float(row.get("day_change_pct") or row.get("price_change_pct") or 0) < 0)
        unchanged = max(0, len(rows) - advances - declines)
        up_volume = sum(float(row.get("current_volume") or 0) for row in rows if float(row.get("day_change_pct") or row.get("price_change_pct") or 0) > 0)
        down_volume = sum(float(row.get("current_volume") or 0) for row in rows if float(row.get("day_change_pct") or row.get("price_change_pct") or 0) < 0)
        participation_pct = round(((advances + declines) / len(rows)) * 100, 1)
        advance_ratio = advances / max(1, advances + declines)
        volume_ratio = up_volume / max(1.0, up_volume + down_volume)
        score_value = round(advance_ratio * 65 + volume_ratio * 35, 1)
        direction = "bullish" if score_value >= 58 else "bearish" if score_value <= 42 else "neutral"
        leaders = sorted(rows, key=lambda row: float(row.get("volume_ratio") or 0), reverse=True)[:6]

        return BreadthSnapshot(
            score=PositioningScore(
                score=score_value,
                direction=direction,
                confidence=min(85, 35 + len(rows) * 2),
                components={
                    "advance_ratio": round(advance_ratio * 100, 1),
                    "up_volume_share": round(volume_ratio * 100, 1),
                    "participation_pct": participation_pct,
                },
                explanation=[
                    f"{advances} advancing vs {declines} declining symbols in the active scanner set.",
                    f"Up-volume share is {round(volume_ratio * 100, 1)}%.",
                ],
            ),
            advances=advances,
            declines=declines,
            unchanged=unchanged,
            up_volume=round(up_volume, 2),
            down_volume=round(down_volume, 2),
            participation_pct=participation_pct,
            leaders=leaders,
        )
