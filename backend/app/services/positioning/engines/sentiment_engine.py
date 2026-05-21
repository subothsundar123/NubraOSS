from __future__ import annotations

from typing import Any

from app.services.positioning.contracts import PositioningScore, SentimentSnapshot


class SentimentEngine:
    def compute(self, context: dict[str, Any]) -> SentimentSnapshot:
        breadth = context["breadth"].score
        sector = context["sector_rotation"].score
        smart_money = context["smart_money"].score
        options = context["options_pressure"].score
        score_value = round(
            breadth.score * 0.35
            + sector.score * 0.25
            + smart_money.score * 0.25
            + options.score * 0.15,
            1,
        )
        direction = "bullish" if score_value >= 60 else "bearish" if score_value <= 40 else "neutral"
        label = "Risk-on" if score_value >= 65 else "Risk-off" if score_value <= 35 else "Neutral"

        return SentimentSnapshot(
            label=label,
            score=PositioningScore(
                score=score_value,
                direction=direction,
                confidence=round((breadth.confidence + sector.confidence + smart_money.confidence + options.confidence) / 4, 1),
                components={
                    "breadth": breadth.score,
                    "sector_rotation": sector.score,
                    "smart_money": smart_money.score,
                    "options_pressure": options.score,
                },
                explanation=[
                    f"Composite sentiment is {label.lower()} from breadth, sector rotation, smart money and options pressure.",
                ],
                stale=any([breadth.stale, sector.stale, smart_money.stale, options.stale]),
            ),
        )
