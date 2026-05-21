from __future__ import annotations

from typing import Any

from app.services.positioning.contracts import OpportunitySnapshot, PositioningScore, neutral_score


class OpportunityEngine:
    def compute(self, context: dict[str, Any]) -> OpportunitySnapshot:
        rows = list(context.get("market_rows") or [])
        if not rows:
            return OpportunitySnapshot(score=neutral_score("No opportunities can be ranked yet.", stale=True), rows=[])

        sector_strength = {
            item["sector"]: float(item["strength"])
            for item in context["sector_rotation"].sectors
            if item.get("sector")
        }
        internals = context.get("market_internals")
        participation_quality = float(getattr(getattr(internals, "score", None), "score", 50) or 50)
        control_state = str(getattr(internals, "control_state", "rotational_balance") or "rotational_balance")
        internals_bonus = (participation_quality - 50) * 0.18
        ranked = []
        for row in rows:
            volume_ratio = float(row.get("volume_ratio") or 0)
            change = float(row.get("day_change_pct") or row.get("price_change_pct") or 0)
            sector_score = sector_strength.get(row.get("sector"), 50)
            breakout_bonus = 12 if row.get("is_price_breakout") else 0
            control_bonus = 6 if control_state == "initiative_buyers" and change > 0 else -8 if control_state in {"exhaustion", "unstable_expansion"} and change > 0 else 0
            quality = max(0, min(100, volume_ratio * 16 + max(-3, min(3, change)) * 5 + sector_score * 0.35 + breakout_bonus + internals_bonus + control_bonus))
            ranked.append(
                {
                    "symbol": row.get("symbol"),
                    "display_name": row.get("display_name"),
                    "exchange": row.get("exchange"),
                    "sector": row.get("sector"),
                    "last_price": row.get("last_price"),
                    "volume_ratio": round(volume_ratio, 2),
                    "change_pct": round(change, 2),
                    "quality_score": round(quality, 1),
                    "reason": [
                        f"{round(volume_ratio, 2)}x relative volume",
                        f"{row.get('sector') or 'Unknown'} sector strength {round(sector_score, 1)}",
                        f"Participation quality {round(participation_quality, 1)} with {control_state.replace('_', ' ')} control",
                    ],
                }
            )
        ranked.sort(key=lambda item: item["quality_score"], reverse=True)
        top = ranked[0]["quality_score"] if ranked else 50
        return OpportunitySnapshot(
            rows=ranked[:12],
            score=PositioningScore(
                score=round(top, 1),
                direction="bullish" if top >= 60 else "neutral",
                confidence=min(85, 40 + len(ranked)),
                components={"ranked_count": float(len(ranked)), "top_quality": float(top)},
                explanation=[f"{len(ranked)} active candidates ranked using volume, price and sector alignment."],
            ),
        )
