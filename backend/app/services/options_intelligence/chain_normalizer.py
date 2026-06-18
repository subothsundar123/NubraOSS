"""
Normalise a PositioningOptionChainResponse (which now carries all Greeks)
into the richer OIEChainResponse consumed by the Options Intelligence Engine.

Responsibilities:
  • Add per-strike GEX (gamma exposure) for CE and PE sides.
  • Call greeks_aggregator to compute chain-level aggregates.
  • Persist a lightweight snapshot row to SQLite for historical queries.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.schemas import OIEChainResponse, PositioningOptionChainResponse

UTC = timezone.utc


def build_oie_chain(
    base: "PositioningOptionChainResponse",
    lot_size: int,
) -> "OIEChainResponse":
    """Convert the enriched base chain into an OIEChainResponse with GEX data."""
    from app.schemas import OIEChainResponse, OIEChainStrikeRow
    from app.services.options_intelligence.greeks_aggregator import compute_aggregates

    spot = base.spot_price
    oie_strikes: list[OIEChainStrikeRow] = []

    for s in base.strikes:
        ce_gex = _gex_side(s.ce_gamma, s.ce_oi, lot_size, spot)
        pe_gex = _gex_side(s.pe_gamma, s.pe_oi, lot_size, spot)
        net_gex: float | None = None
        if ce_gex is not None or pe_gex is not None:
            net_gex = round((ce_gex or 0.0) - (pe_gex or 0.0), 2)

        oie_strikes.append(OIEChainStrikeRow(
            strike_price=s.strike_price,
            distance_from_spot=s.distance_from_spot,
            is_atm=s.is_atm,
            ce_ref_id=s.ce_ref_id,
            ce_oi=s.ce_oi,
            ce_oi_change=s.ce_oi_change,
            ce_iv=s.ce_iv,
            ce_ltp=s.ce_ltp,
            ce_delta=s.ce_delta,
            ce_gamma=s.ce_gamma,
            ce_theta=s.ce_theta,
            ce_vega=s.ce_vega,
            ce_volume=s.ce_volume,
            ce_gex=ce_gex,
            pe_ref_id=s.pe_ref_id,
            pe_oi=s.pe_oi,
            pe_oi_change=s.pe_oi_change,
            pe_iv=s.pe_iv,
            pe_ltp=s.pe_ltp,
            pe_delta=s.pe_delta,
            pe_gamma=s.pe_gamma,
            pe_theta=s.pe_theta,
            pe_vega=s.pe_vega,
            pe_volume=s.pe_volume,
            pe_gex=pe_gex,
            net_gex=net_gex,
        ))

    aggregates = compute_aggregates(oie_strikes, lot_size, spot)

    return OIEChainResponse(
        underlying=base.underlying,
        spot_price=base.spot_price,
        atm_strike=base.atm_strike,
        expiry=base.expiry,
        lot_size=lot_size,
        pcr=base.pcr,
        max_pain=base.max_pain,
        straddle_price=base.straddle_price,
        total_ce_oi=base.total_ce_oi,
        total_pe_oi=base.total_pe_oi,
        strikes=oie_strikes,
        aggregates=aggregates,
        fetched_at=base.fetched_at,
        market_closed=base.market_closed,
    )


def persist_snapshot(oie: "OIEChainResponse", environment: str) -> None:
    """Store a lightweight snapshot row for historical GEX / PCR queries."""
    try:
        from app.db import connect_db
        with connect_db() as conn:
            # 60-second dedup: skip if an identical row was just written.
            # Use IS NULL / = comparison to handle NULL expiry correctly (SQL NULL != NULL).
            recent = conn.execute(
                "SELECT 1 FROM oie_chain_snapshots "
                "WHERE underlying=? AND environment=? "
                "AND (expiry=? OR (expiry IS NULL AND ? IS NULL)) "
                "AND created_at >= datetime('now', '-60 seconds') LIMIT 1",
                (oie.underlying, environment, oie.expiry, oie.expiry),
            ).fetchone()
            if recent:
                return
            conn.execute(
                """
                insert into oie_chain_snapshots
                    (underlying, expiry, environment, created_at, spot_price,
                     total_gex, gamma_flip, gamma_flip_level, pcr, max_pain, gex_bias, payload_json)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    oie.underlying,
                    oie.expiry,
                    environment,
                    datetime.now(UTC).isoformat(),
                    oie.spot_price,
                    oie.aggregates.total_gex,
                    oie.aggregates.gamma_flip_level,
                    oie.aggregates.gamma_flip_level,
                    oie.pcr,
                    oie.max_pain,
                    oie.aggregates.gex_bias,
                    json.dumps({
                        "net_delta": oie.aggregates.net_delta,
                        "net_gamma": oie.aggregates.net_gamma,
                        "net_vega": oie.aggregates.net_vega,
                        "net_theta": oie.aggregates.net_theta,
                        "call_wall": oie.aggregates.call_wall,
                        "put_wall": oie.aggregates.put_wall,
                        "ce_gex_total": oie.aggregates.ce_gex_total,
                        "pe_gex_total": oie.aggregates.pe_gex_total,
                    }),
                ),
            )
            conn.commit()
    except Exception:
        pass  # snapshots are best-effort; never block the response


# ── helpers ─────────────────────────────────────────────────────────────────

def _gex_side(
    gamma: float | None,
    oi: float | None,
    lot_size: int,
    spot: float | None,
) -> float | None:
    if gamma is None or oi is None or not spot or spot <= 0:
        return None
    return round(gamma * oi * lot_size * spot, 2)
