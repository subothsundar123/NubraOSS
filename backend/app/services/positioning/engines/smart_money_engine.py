from __future__ import annotations

from typing import Any

from app.services.positioning.contracts import PositioningScore, SmartMoneySnapshot, neutral_score


class SmartMoneyEngine:
    def compute(self, context: dict[str, Any]) -> SmartMoneySnapshot:
        rows = list(context.get("market_rows") or [])
        if not rows:
            return SmartMoneySnapshot(score=neutral_score("No volume anomaly rows are available yet.", stale=True))

        candidates = []
        for row in rows:
            volume_ratio = float(row.get("volume_ratio") or 0)
            change = float(row.get("day_change_pct") or row.get("price_change_pct") or 0)
            price_breakout = 1 if row.get("is_price_breakout") else 0
            raw_score = volume_ratio * 18 + max(-3, min(3, change)) * 6 + price_breakout * 18
            score = max(0, min(100, raw_score))
            if score >= 45:
                candidates.append(
                    {
                        "symbol": row.get("symbol"),
                        "display_name": row.get("display_name"),
                        "sector": row.get("sector"),
                        "score": round(score, 1),
                        "volume_ratio": round(volume_ratio, 2),
                        "change_pct": round(change, 2),
                        "bias": "accumulation" if change >= 0 else "distribution",
                    }
                )
        candidates.sort(key=lambda item: item["score"], reverse=True)
        top_score = candidates[0]["score"] if candidates else 50
        direction = "bullish" if top_score >= 65 and candidates[0]["bias"] == "accumulation" else "bearish" if candidates and candidates[0]["bias"] == "distribution" else "neutral"

        return SmartMoneySnapshot(
            candidates=candidates[:10],
            score=PositioningScore(
                score=round(top_score, 1),
                direction=direction,
                confidence=min(80, 35 + len(candidates) * 4),
                components={"candidate_count": float(len(candidates)), "top_score": float(top_score)},
                explanation=[
                    f"{len(candidates)} abnormal volume candidates passed the Phase 1 smart-money filter.",
                ],
            ),
        )
