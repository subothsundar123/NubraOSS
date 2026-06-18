"""
Analytics Engine entry point for the Options Intelligence Engine.

Loads all metric modules (triggering auto-registration), fetches IV history
from SQLite, and returns the full MetricResult dict for a given OIE chain.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.schemas import OIEChainResponse

# Import metric modules to trigger auto-registration in _REGISTRY
from app.services.options_intelligence.analytics import AnalyticsContext, compute_all
import app.services.options_intelligence.analytics.oi_metrics  # noqa: F401
import app.services.options_intelligence.analytics.volatility_metrics  # noqa: F401
import app.services.options_intelligence.analytics.greeks_metrics  # noqa: F401


def run_analytics(
    chain: "OIEChainResponse",
    environment: str,
    lookback_days: int = 252,
) -> dict:
    """
    Run all registered metrics against the given chain.
    Returns a dict of metric_key → MetricResult (serializable).
    """
    iv_history = _load_iv_history(chain.underlying, environment, lookback_days)
    chain_history = _load_chain_history(chain.underlying, environment, lookback_days)

    ctx = AnalyticsContext(
        chain=chain,
        iv_history=iv_history,
        chain_history=chain_history,
    )
    results = compute_all(ctx)
    return {k: v.__dict__ for k, v in results.items()}


def _load_iv_history(underlying: str, environment: str, days: int) -> list[dict]:
    try:
        from app.db import connect_db
        with connect_db() as conn:
            rows = conn.execute(
                """
                select recorded_at, atm_iv, atm_strike, iv_percentile, iv_rank
                from oie_iv_history
                where underlying = ? and environment = ?
                  and recorded_at >= datetime('now', ?)
                order by recorded_at desc
                limit 500
                """,
                (underlying.upper(), environment, f"-{days} days"),
            ).fetchall()
        return [dict(row) for row in rows]
    except Exception:
        return []


def _load_chain_history(underlying: str, environment: str, days: int) -> list[dict]:
    try:
        from app.db import connect_db
        import json
        with connect_db() as conn:
            rows = conn.execute(
                """
                select created_at, spot_price, total_gex, gamma_flip_level,
                       pcr, max_pain, gex_bias, payload_json
                from oie_chain_snapshots
                where underlying = ? and environment = ?
                  and created_at >= datetime('now', ?)
                order by created_at desc
                limit 500
                """,
                (underlying.upper(), environment, f"-{days} days"),
            ).fetchall()
        result = []
        for row in rows:
            d = dict(row)
            try:
                d.update(json.loads(d.pop("payload_json", "{}")))
            except Exception:
                pass
            result.append(d)
        return result
    except Exception:
        return []


def record_iv_snapshot(chain: "OIEChainResponse", environment: str) -> None:
    """Persist today's ATM IV to history for IV Rank / Percentile calculations."""
    atm_row = next((s for s in chain.strikes if s.is_atm), None)
    if atm_row is None:
        return
    atm_iv_raw = atm_row.ce_iv or atm_row.pe_iv
    if atm_iv_raw is None:
        return
    # Nubra API returns IV as decimal (e.g. 0.1255 = 12.55%). Normalise to %
    # so it matches the bootstrap script (which stores VIX in % form like 13.0).
    atm_iv_pct = round(atm_iv_raw * 100, 4) if atm_iv_raw < 2 else round(atm_iv_raw, 4)
    try:
        from datetime import datetime, timezone
        from app.db import connect_db
        with connect_db() as conn:
            # Only record once per hour per underlying/expiry (IV doesn't change that fast)
            recent = conn.execute(
                "SELECT 1 FROM oie_iv_history "
                "WHERE underlying=? AND expiry=? AND environment=? "
                "AND recorded_at >= datetime('now', '-60 minutes') LIMIT 1",
                (chain.underlying, chain.expiry, environment),
            ).fetchone()
            if recent:
                return
            conn.execute(
                """
                insert or ignore into oie_iv_history
                    (underlying, expiry, environment, recorded_at, atm_iv, atm_strike,
                     iv_rank, iv_percentile, payload_json)
                values (?, ?, ?, ?, ?, ?, NULL, NULL, '{}')
                """,
                (
                    chain.underlying,
                    chain.expiry,
                    environment,
                    datetime.now(timezone.utc).isoformat(),
                    atm_iv_pct,
                    atm_row.strike_price,
                ),
            )
            conn.commit()
    except Exception:
        pass
