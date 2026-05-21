from __future__ import annotations

from typing import Any

from app.services.positioning.contracts import CommentaryItem


class CommentaryEngine:
    def compute(self, context: dict[str, Any]) -> list[CommentaryItem]:
        sentiment = context["sentiment"]
        regime = context["regime"]
        breadth = context["breadth"]
        sectors = context["sector_rotation"].leadership
        opportunities = context["opportunities"].rows
        internals = context.get("market_internals")
        leader = opportunities[0]["symbol"] if opportunities else "No leader"
        control = getattr(internals, "control_state", "rotational_balance")
        thrusts = getattr(internals, "thrusts", []) if internals else []
        participation = getattr(internals, "participation", {}) if internals else {}
        concentration = getattr(internals, "concentration", {}) if internals else {}

        items = [
            CommentaryItem(
                id=f"regime-{context['seq']}",
                severity="info" if sentiment.score.direction != "bearish" else "warning",
                title=f"{regime.label} tape",
                message=(
                    f"Sentiment is {sentiment.label.lower()} at {sentiment.score.score:.1f}. "
                    f"Breadth shows {breadth.advances} advances against {breadth.declines} declines."
                ),
                tags=["regime", "sentiment"],
            ),
            CommentaryItem(
                id=f"internals-{context['seq']}",
                severity="warning" if control in {"unstable_expansion", "exhaustion"} else "info",
                title=f"Control: {str(control).replace('_', ' ')}",
                message=(
                    f"Participation quality is {internals.score.score:.1f}. "
                    f"{getattr(internals, 'transition_reason', 'Control remains rotational')} "
                    f"Sector participation breadth is {participation.get('sector_participation_breadth', 0)}%."
                ) if internals else "Market internals are waiting for scanner participation data.",
                tags=["internals", "control"],
            ),
            CommentaryItem(
                id=f"sector-{context['seq']}",
                severity="info",
                title="Rotation watch",
                message=(
                    f"Leadership is concentrated in {', '.join(sectors[:3]) if sectors else 'unclassified sectors'}; "
                    f"top sector share is {concentration.get('top_sector_share', 0)}%; top opportunity is {leader}."
                ),
                tags=["sector", "opportunity"],
            ),
        ]
        for index, thrust in enumerate(thrusts[:2]):
            items.append(
                CommentaryItem(
                    id=f"thrust-{context['seq']}-{index}",
                    severity=thrust.get("severity", "info"),
                    title=str(thrust.get("type", "participation event")).replace("_", " ").title(),
                    message=str(thrust.get("message", "Participation state changed.")),
                    tags=["internals", "thrust"],
                )
            )
        return items
