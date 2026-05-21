from __future__ import annotations

from typing import Any

from app.services.positioning.contracts import AlertItem


class AlertEngine:
    def compute(self, context: dict[str, Any]) -> list[AlertItem]:
        alerts: list[AlertItem] = []
        sentiment = context["sentiment"].score
        opportunities = context["opportunities"].rows
        internals = context.get("market_internals")
        seq = context["seq"]

        if sentiment.score >= 70:
            alerts.append(
                AlertItem(
                    id=f"sentiment-risk-on-{seq}",
                    severity="info",
                    title="Risk-on sentiment expansion",
                    message=f"Market sentiment reached {sentiment.score:.1f} with bullish positioning alignment.",
                    payload={"score": sentiment.score},
                )
            )
        elif sentiment.score <= 30:
            alerts.append(
                AlertItem(
                    id=f"sentiment-risk-off-{seq}",
                    severity="warning",
                    title="Risk-off sentiment pressure",
                    message=f"Market sentiment fell to {sentiment.score:.1f}; avoid weak long setups.",
                    payload={"score": sentiment.score},
                )
            )

        if opportunities and float(opportunities[0].get("quality_score") or 0) >= 80:
            top = opportunities[0]
            alerts.append(
                AlertItem(
                    id=f"opportunity-{top.get('symbol')}-{seq}",
                    severity="info",
                    title=f"High-quality opportunity: {top.get('symbol')}",
                    message=f"{top.get('symbol')} ranks {top.get('quality_score')} with {top.get('volume_ratio')}x relative volume.",
                    payload=top,
                )
            )

        if internals:
            for thrust in internals.thrusts:
                thrust_type = str(thrust.get("type") or "internals")
                severity = str(thrust.get("severity") or "info")
                alerts.append(
                    AlertItem(
                        id=f"internals-{thrust_type}-{seq}",
                        severity="warning" if severity == "warning" else "info",
                        title=str(thrust_type).replace("_", " ").title(),
                        message=str(thrust.get("message") or internals.transition_reason),
                        payload={
                            "control_state": internals.control_state,
                            "participation_quality": internals.score.score,
                            "thrust": thrust,
                        },
                    )
                )

            if internals.control_state in {"initiative_buyers", "initiative_sellers"} and internals.score.confidence >= 55:
                alerts.append(
                    AlertItem(
                        id=f"control-{internals.control_state}-{seq}",
                        severity="info",
                        title=f"Control shift: {internals.control_state.replace('_', ' ')}",
                        message=internals.transition_reason,
                        payload={"control_state": internals.control_state, "score": internals.score.score},
                    )
                )

        return alerts
