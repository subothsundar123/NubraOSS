"""
Alert Engine — evaluates all active strategies and fires alerts for those that match.

Called on every /api/oie/intelligence or /api/oie/alerts request.
Writes fired alerts to oie_alerts table. Deduplicates within a 5-minute window
to avoid alert storms on repeated polling.
"""
from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

UTC = timezone.utc
DEDUP_WINDOW_MINUTES = 5


@dataclass
class FiredAlert:
    id: str
    strategy_id: str
    strategy_name: str
    underlying: str
    created_at: str
    severity: str           # "info" | "warning" | "critical"
    title: str
    message: str
    match_score: float
    matched_count: int
    total_count: int


def _severity(match_score: float, action: str) -> str:
    if action == "execute":
        return "critical"
    if match_score >= 90:
        return "critical"
    if match_score >= 70:
        return "warning"
    return "info"


def _was_recently_alerted(conn: Any, strategy_id: str, environment: str, window_min: int = DEDUP_WINDOW_MINUTES) -> bool:
    cutoff = (datetime.now(UTC) - timedelta(minutes=window_min)).isoformat()
    row = conn.execute(
        "select id from oie_alerts where strategy_id=? and environment=? and created_at>? limit 1",
        (strategy_id, environment, cutoff),
    ).fetchone()
    return row is not None


def fire_alerts(
    metrics: dict[str, Any],
    chain: Any,
    environment: str,
    min_match_score: float = 60.0,
) -> list[FiredAlert]:
    """
    Evaluate all strategies, fire alerts for those that match with score >= min_match_score.
    Returns list of newly-fired alerts.
    """
    from app.services.options_intelligence.strategy_engine import evaluate_all_strategies

    matches = evaluate_all_strategies(metrics, chain, environment)
    fired: list[FiredAlert] = []

    if not matches:
        return fired

    try:
        from app.db import get_db_connection
        with get_db_connection() as conn:
            for match in matches:
                if not match.matched and match.match_score < min_match_score:
                    continue
                if _was_recently_alerted(conn, match.strategy_id, environment):
                    continue

                sev = _severity(match.match_score, match.action)
                alert_id = str(uuid.uuid4())
                now = datetime.now(UTC).isoformat()
                title = f"{match.strategy_name} triggered" if match.matched else f"{match.strategy_name} — partial match"
                message = (
                    f"{match.matched_count}/{match.total_count} conditions met "
                    f"({match.match_score:.0f}% match) on {match.underlying}"
                )

                conn.execute(
                    """insert into oie_alerts
                       (id, strategy_id, underlying, environment, created_at, severity, title,
                        message, match_score, matched_count, total_count, payload_json)
                       values (?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (
                        alert_id,
                        match.strategy_id,
                        match.underlying,
                        environment,
                        now,
                        sev,
                        title,
                        message,
                        match.match_score,
                        match.matched_count,
                        match.total_count,
                        json.dumps({
                            "strategy_name": match.strategy_name,
                            "action": match.action,
                            "matched_groups": match.matched_groups,
                            "total_groups": match.total_groups,
                            "conditions": [c.__dict__ for c in match.condition_results],
                        }),
                    ),
                )

                fired.append(FiredAlert(
                    id=alert_id,
                    strategy_id=match.strategy_id,
                    strategy_name=match.strategy_name,
                    underlying=match.underlying,
                    created_at=now,
                    severity=sev,
                    title=title,
                    message=message,
                    match_score=match.match_score,
                    matched_count=match.matched_count,
                    total_count=match.total_count,
                ))
    except Exception:
        pass

    return fired


def get_recent_alerts(
    underlying: str,
    environment: str,
    limit: int = 50,
    min_score: float = 0.0,
    severity_filter: str = "all",
) -> list[dict[str, Any]]:
    """Fetch recent alerts from DB with optional filters."""
    try:
        from app.db import get_db_connection
        with get_db_connection() as conn:
            rows = conn.execute(
                """select id, strategy_id, underlying, environment, created_at, severity, title,
                          message, match_score, matched_count, total_count
                   from oie_alerts
                   where underlying=? and environment=? and match_score>=?
                   order by created_at desc
                   limit ?""",
                (underlying.upper(), environment, min_score, limit),
            ).fetchall()

        cols = ["id", "strategy_id", "underlying", "environment", "created_at", "severity",
                "title", "message", "match_score", "matched_count", "total_count"]
        results = [dict(zip(cols, r)) for r in rows]

        if severity_filter != "all":
            sev_rank = {"info": 0, "warning": 1, "critical": 2}
            min_rank = sev_rank.get(severity_filter, 0)
            results = [r for r in results if sev_rank.get(r["severity"], 0) >= min_rank]

        return results
    except Exception:
        return []
