from __future__ import annotations

from typing import Any

from app.services.positioning.contracts import OptionsPressureSnapshot, PositioningScore


class OptionsPressureEngine:
    def compute(self, context: dict[str, Any]) -> OptionsPressureSnapshot:
        sentiment_hint = float(context.get("breadth").score.score if context.get("breadth") else 50)
        rows = list(context.get("market_rows") or [])
        bullish_pressure = 0.0
        bearish_pressure = 0.0
        for row in rows:
            volume_ratio = float(row.get("volume_ratio") or 0)
            change = float(row.get("day_change_pct") or row.get("price_change_pct") or 0)
            impulse = min(18.0, volume_ratio * 4.0 + abs(change) * 1.5)
            if change >= 0:
                bullish_pressure += impulse
            else:
                bearish_pressure += impulse
        total_pressure = max(1.0, bullish_pressure + bearish_pressure)
        flow_bias = ((bullish_pressure - bearish_pressure) / total_pressure) * 18.0
        call_pressure = max(0, min(100, sentiment_hint + 6 + flow_bias))
        put_pressure = max(0, min(100, 100 - sentiment_hint + 4 - flow_bias))
        net = call_pressure - put_pressure
        direction = "bullish" if net >= 12 else "bearish" if net <= -12 else "neutral"
        score_value = max(call_pressure, put_pressure) if direction != "neutral" else 50
        confidence = 42 if rows else 28
        if abs(net) >= 18:
            confidence += 12

        return OptionsPressureSnapshot(
            underlying="NIFTY",
            call_pressure=round(call_pressure, 1),
            put_pressure=round(put_pressure, 1),
            zones=[
                {
                    "label": "ATM pressure proxy",
                    "bias": direction,
                    "score": round(score_value, 1),
                    "note": "Phase 1 pressure uses breadth plus cash-market impulse until strike OI snapshots are wired.",
                },
                {
                    "label": "Cash impulse proxy",
                    "bias": "bullish" if bullish_pressure >= bearish_pressure else "bearish",
                    "score": round(max(bullish_pressure, bearish_pressure), 1),
                    "note": "Derived from relative-volume and directional move in ranked scanner rows.",
                }
            ],
            score=PositioningScore(
                score=round(score_value, 1),
                direction=direction,
                confidence=min(70, confidence),
                components={
                    "call_pressure": round(call_pressure, 1),
                    "put_pressure": round(put_pressure, 1),
                    "cash_bullish_impulse": round(bullish_pressure, 1),
                    "cash_bearish_impulse": round(bearish_pressure, 1),
                },
                explanation=["Options pressure blends breadth with cash-market impulse until normalized strike OI is available."],
                stale=not bool(rows),
            ),
        )
