from __future__ import annotations

from typing import Any

from app.services.positioning.contracts import PositioningScore, RegimeSnapshot


class RegimeEngine:
    def compute(self, context: dict[str, Any]) -> RegimeSnapshot:
        sentiment = context["sentiment"].score
        breadth = context["breadth"].score
        sector = context["sector_rotation"].score
        concentration = float(context["sector_rotation"].concentration_score or 0)

        if sentiment.score >= 64 and breadth.score >= 58:
            regime = "trend_up"
            label = "Trend Up"
        elif sentiment.score <= 36 and breadth.score <= 42:
            regime = "trend_down"
            label = "Trend Down"
        elif concentration >= 55 and 42 <= sentiment.score <= 58:
            regime = "mean_reversion"
            label = "Selective Rotation"
        elif abs(sentiment.score - 50) <= 8 and abs(sector.score - 50) <= 10:
            regime = "range"
            label = "Range"
        else:
            regime = "volatile_chop"
            label = "Mixed Tape"

        confidence = min(90, max(35, abs(sentiment.score - 50) * 1.4 + abs(breadth.score - 50) * 0.8 + 30))
        direction = "bullish" if regime == "trend_up" else "bearish" if regime == "trend_down" else "mixed"

        return RegimeSnapshot(
            regime=regime,  # type: ignore[arg-type]
            label=label,
            score=PositioningScore(
                score=round(confidence, 1),
                direction=direction,
                confidence=round(confidence, 1),
                components={
                    "sentiment": sentiment.score,
                    "breadth": breadth.score,
                    "sector_rotation": sector.score,
                    "concentration": concentration,
                },
                explanation=[f"Current regime classified as {label} from composite agreement."],
                stale=sentiment.stale or breadth.stale or sector.stale,
            ),
        )
