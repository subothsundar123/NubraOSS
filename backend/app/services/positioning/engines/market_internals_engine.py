from __future__ import annotations

from collections import defaultdict
from typing import Any

from app.services.positioning.contracts import MarketInternalsSnapshot, PositioningScore, neutral_score


def _num(value: Any, default: float = 0.0) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed == parsed else default


class MarketInternalsEngine:
    def compute(self, context: dict[str, Any]) -> MarketInternalsSnapshot:
        rows = list(context.get("market_rows") or [])
        if not rows:
            return MarketInternalsSnapshot(score=neutral_score("Market internals need scanner rows before participation can be scored.", stale=True))

        total = len(rows)
        advancing = [row for row in rows if _num(row.get("day_change_pct") or row.get("price_change_pct")) > 0]
        declining = [row for row in rows if _num(row.get("day_change_pct") or row.get("price_change_pct")) < 0]
        above_open_pct = (len(advancing) / max(1, total)) * 100
        abnormal_rows = [row for row in rows if _num(row.get("volume_ratio")) >= 1.5]
        expanding_rows = [row for row in rows if _num(row.get("volume_ratio")) >= 2.0]
        abnormal_pct = (len(abnormal_rows) / max(1, total)) * 100
        expanding_pct = (len(expanding_rows) / max(1, total)) * 100
        up_volume = sum(_num(row.get("current_volume")) for row in advancing)
        down_volume = sum(_num(row.get("current_volume")) for row in declining)
        volume_total = max(1.0, up_volume + down_volume)
        up_volume_share = (up_volume / volume_total) * 100

        sectors: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in rows:
            sector = str(row.get("sector") or "Unclassified")
            sectors[sector].append(row)
        participating_sectors = 0
        sector_scores: list[dict[str, Any]] = []
        sector_volume: dict[str, float] = {}
        for sector, items in sectors.items():
            sector_adv = sum(1 for item in items if _num(item.get("day_change_pct") or item.get("price_change_pct")) > 0)
            sector_breadth = (sector_adv / max(1, len(items))) * 100
            sector_rvol = sum(_num(item.get("volume_ratio")) for item in items) / max(1, len(items))
            if sector_breadth >= 55 and sector_rvol >= 1.2:
                participating_sectors += 1
            volume = sum(_num(item.get("current_volume")) for item in items)
            sector_volume[sector] = volume
            sector_scores.append({"sector": sector, "breadth_pct": round(sector_breadth, 1), "avg_volume_ratio": round(sector_rvol, 2), "volume": round(volume, 2)})

        top_sector = max(sector_volume.items(), key=lambda item: item[1], default=("Unclassified", 0.0))
        top_sector_share = (top_sector[1] / max(1.0, sum(sector_volume.values()))) * 100
        top_symbols = sorted(rows, key=lambda row: _num(row.get("current_volume")), reverse=True)[:5]
        top_symbol_volume = sum(_num(row.get("current_volume")) for row in top_symbols)
        top_symbol_share = (top_symbol_volume / max(1.0, sum(_num(row.get("current_volume")) for row in rows))) * 100
        leadership_narrow = top_sector_share >= 45 or top_symbol_share >= 58

        accepted_rows = [
            row for row in rows
            if _num(row.get("volume_ratio")) >= 1.4 and bool(row.get("is_green")) and (bool(row.get("is_price_breakout")) or _num(row.get("day_change_pct")) > 0.7)
        ]
        rejected_rows = [
            row for row in rows
            if _num(row.get("volume_ratio")) >= 1.4 and not bool(row.get("is_green")) and (bool(row.get("is_price_breakout")) or _num(row.get("day_change_pct")) < -0.7)
        ]
        acceptance_pct = (len(accepted_rows) / max(1, total)) * 100
        rejection_pct = (len(rejected_rows) / max(1, total)) * 100

        participation_score = above_open_pct * 0.26 + up_volume_share * 0.24 + abnormal_pct * 0.18 + (participating_sectors / max(1, len(sectors))) * 100 * 0.22
        concentration_penalty = max(0.0, top_sector_share - 35) * 0.45 + max(0.0, top_symbol_share - 45) * 0.35
        acceptance_bonus = (acceptance_pct - rejection_pct) * 0.18
        quality = max(0.0, min(100.0, participation_score - concentration_penalty + acceptance_bonus))

        control_state, transition_reason = self._control_state(
            quality=quality,
            above_open_pct=above_open_pct,
            up_volume_share=up_volume_share,
            abnormal_pct=abnormal_pct,
            acceptance_pct=acceptance_pct,
            rejection_pct=rejection_pct,
            leadership_narrow=leadership_narrow,
        )
        thrusts = self._thrusts(
            above_open_pct=above_open_pct,
            abnormal_pct=abnormal_pct,
            expanding_pct=expanding_pct,
            top_sector_share=top_sector_share,
            acceptance_pct=acceptance_pct,
            rejection_pct=rejection_pct,
            quality=quality,
        )

        direction = "bullish" if control_state in {"initiative_buyers", "responsive_buyers"} else "bearish" if control_state in {"initiative_sellers", "responsive_sellers"} else "mixed"
        evidence = [
            f"{round(above_open_pct, 1)}% of active symbols are trading above open/proxy.",
            f"Up-volume share is {round(up_volume_share, 1)}% with {round(abnormal_pct, 1)}% abnormal participation.",
            f"{participating_sectors} of {len(sectors)} sectors show participation confirmation.",
            f"Top sector {top_sector[0]} contributes {round(top_sector_share, 1)}% of tracked volume.",
        ]

        return MarketInternalsSnapshot(
            score=PositioningScore(
                score=round(quality, 1),
                direction=direction,
                confidence=min(88, 38 + total * 1.4 + len(sectors) * 2),
                components={
                    "above_open_pct": round(above_open_pct, 1),
                    "up_volume_share": round(up_volume_share, 1),
                    "abnormal_participation_pct": round(abnormal_pct, 1),
                    "sector_participation_pct": round((participating_sectors / max(1, len(sectors))) * 100, 1),
                    "top_sector_share": round(top_sector_share, 1),
                    "top_symbol_share": round(top_symbol_share, 1),
                    "acceptance_pct": round(acceptance_pct, 1),
                    "rejection_pct": round(rejection_pct, 1),
                },
                explanation=evidence,
            ),
            control_state=control_state,
            transition_reason=transition_reason,
            participation={
                "advances": len(advancing),
                "declines": len(declining),
                "above_open_pct": round(above_open_pct, 1),
                "above_vwap_pct": round(acceptance_pct, 1),
                "volume_participation_pct": round(up_volume_share, 1),
                "sector_participation_breadth": round((participating_sectors / max(1, len(sectors))) * 100, 1),
                "sectors": sorted(sector_scores, key=lambda item: item["avg_volume_ratio"], reverse=True)[:8],
            },
            liquidity={
                "abnormal_turnover_pct": round(abnormal_pct, 1),
                "expanding_turnover_pct": round(expanding_pct, 1),
                "broad_liquidity_expansion": expanding_pct >= 28 and participating_sectors >= 3,
            },
            concentration={
                "top_sector": top_sector[0],
                "top_sector_share": round(top_sector_share, 1),
                "top_symbol_share": round(top_symbol_share, 1),
                "narrow_leadership": leadership_narrow,
                "top_symbols": [{"symbol": row.get("symbol"), "volume": row.get("current_volume"), "volume_ratio": row.get("volume_ratio")} for row in top_symbols],
            },
            acceptance={
                "accepted_pct": round(acceptance_pct, 1),
                "rejected_pct": round(rejection_pct, 1),
                "state": "accepted" if acceptance_pct > rejection_pct + 12 else "rejected" if rejection_pct > acceptance_pct + 12 else "mixed",
            },
            activity={
                "initiative_score": round(max(0.0, acceptance_pct + abnormal_pct - concentration_penalty), 1),
                "responsive_score": round(max(0.0, rejection_pct + max(0.0, 50 - above_open_pct)), 1),
            },
            thrusts=thrusts,
            evidence=evidence,
        )

    def _control_state(
        self,
        *,
        quality: float,
        above_open_pct: float,
        up_volume_share: float,
        abnormal_pct: float,
        acceptance_pct: float,
        rejection_pct: float,
        leadership_narrow: bool,
    ) -> tuple[str, str]:
        if quality >= 68 and above_open_pct >= 58 and up_volume_share >= 58 and acceptance_pct >= 20:
            return "initiative_buyers", "Price, breadth and volume are expanding together above acceptance zones."
        if quality <= 32 and above_open_pct <= 42 and up_volume_share <= 42 and rejection_pct >= 20:
            return "initiative_sellers", "Downside participation and rejection are expanding together."
        if leadership_narrow and quality >= 52:
            return "unstable_expansion", "The move has momentum but leadership is concentrated."
        if abnormal_pct >= 28 and acceptance_pct < 12:
            return "exhaustion", "Turnover is elevated but acceptance is not following through."
        if above_open_pct >= 52 and rejection_pct >= acceptance_pct:
            return "responsive_sellers", "Rallies are being met by rejection despite positive breadth."
        if above_open_pct <= 48 and acceptance_pct >= rejection_pct:
            return "responsive_buyers", "Buyers are defending weakness without broad initiative expansion."
        return "rotational_balance", "Participation is mixed and control remains rotational."

    def _thrusts(self, **values: float) -> list[dict[str, Any]]:
        thrusts: list[dict[str, Any]] = []
        if values["quality"] >= 72 and values["abnormal_pct"] >= 30:
            thrusts.append({"type": "breadth_thrust", "severity": "info", "message": "Participation thrust with broad abnormal turnover."})
        if values["quality"] <= 32:
            thrusts.append({"type": "participation_collapse", "severity": "warning", "message": "Participation quality has collapsed; move is fragile."})
        if values["top_sector_share"] >= 50:
            thrusts.append({"type": "concentration_risk", "severity": "warning", "message": "Leadership is concentrated in one sector."})
        if values["rejection_pct"] > values["acceptance_pct"] + 18:
            thrusts.append({"type": "acceptance_failure", "severity": "warning", "message": "Rejection is outpacing acceptance."})
        if values["expanding_pct"] >= 35 and values["acceptance_pct"] >= 20:
            thrusts.append({"type": "initiative_expansion", "severity": "info", "message": "Liquidity ignition is confirming initiative activity."})
        return thrusts
