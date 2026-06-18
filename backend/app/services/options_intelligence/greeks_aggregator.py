"""
Compute aggregate Greeks and GEX metrics from a normalized OIE option chain.

All values from Nubra API are per-unit (per share).  We scale by:
    oi × lot_size  →  total open interest in shares

GEX formula (Dealer Gamma Exposure):
    CE side  : +gamma × ce_oi × lot_size × spot  (market makers are net-short calls)
    PE side  : −gamma × pe_oi × lot_size × spot  (market makers are net-long puts)
    Net/strike: ce_gex − pe_gex
    Total GEX : Σ net_gex  →  positive = stabilising regime, negative = amplifying regime
"""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.schemas import OIEChainStrikeRow, OIEGreeksAggregates


def compute_aggregates(
    strikes: list["OIEChainStrikeRow"],
    lot_size: int,
    spot_price: float | None,
) -> "OIEGreeksAggregates":
    from app.schemas import OIEGreeksAggregates

    net_delta = 0.0
    net_gamma = 0.0
    net_vega = 0.0
    net_theta = 0.0
    ce_gex_total = 0.0
    pe_gex_total = 0.0

    has_delta = has_gamma = has_vega = has_theta = has_gex = False

    call_wall_oi = 0.0
    put_wall_oi = 0.0
    call_wall: int | None = None
    put_wall: int | None = None

    for s in strikes:
        # Net position Greeks across the chain
        if s.ce_delta is not None and s.ce_oi is not None:
            net_delta += s.ce_delta * s.ce_oi * lot_size
            has_delta = True
        if s.pe_delta is not None and s.pe_oi is not None:
            net_delta -= s.pe_delta * s.pe_oi * lot_size  # PE delta already positive; subtract to get net
            has_delta = True

        if s.ce_gamma is not None and s.ce_oi is not None:
            net_gamma += s.ce_gamma * s.ce_oi * lot_size
            has_gamma = True
        if s.pe_gamma is not None and s.pe_oi is not None:
            net_gamma += s.pe_gamma * s.pe_oi * lot_size
            has_gamma = True

        if s.ce_vega is not None and s.ce_oi is not None:
            net_vega += s.ce_vega * s.ce_oi * lot_size
            has_vega = True
        if s.pe_vega is not None and s.pe_oi is not None:
            net_vega += s.pe_vega * s.pe_oi * lot_size
            has_vega = True

        if s.ce_theta is not None and s.ce_oi is not None:
            net_theta += s.ce_theta * s.ce_oi * lot_size
            has_theta = True
        if s.pe_theta is not None and s.pe_oi is not None:
            net_theta += s.pe_theta * s.pe_oi * lot_size
            has_theta = True

        if s.ce_gex is not None:
            ce_gex_total += s.ce_gex
            has_gex = True
        if s.pe_gex is not None:
            pe_gex_total += s.pe_gex
            has_gex = True

        # Call Wall = highest CE OI at strikes ABOVE spot (resistance above price)
        # Put Wall = highest PE OI at strikes BELOW spot (support below price)
        if spot_price and s.strike_price > spot_price and s.ce_oi is not None and s.ce_oi > call_wall_oi:
            call_wall_oi = s.ce_oi
            call_wall = s.strike_price
        if spot_price and s.strike_price < spot_price and s.pe_oi is not None and s.pe_oi > put_wall_oi:
            put_wall_oi = s.pe_oi
            put_wall = s.strike_price

    total_gex = ce_gex_total - pe_gex_total if has_gex else None
    gamma_flip_level = _find_gamma_flip(strikes) if has_gex else None

    gex_bias = "neutral"
    if total_gex is not None:
        if total_gex > 0:
            gex_bias = "positive"
        elif total_gex < 0:
            gex_bias = "negative"

    return OIEGreeksAggregates(
        lot_size=lot_size,
        net_delta=round(net_delta, 4) if has_delta else None,
        net_gamma=round(net_gamma, 6) if has_gamma else None,
        net_vega=round(net_vega, 2) if has_vega else None,
        net_theta=round(net_theta, 2) if has_theta else None,
        total_gex=round(total_gex, 2) if total_gex is not None else None,
        gamma_flip_level=gamma_flip_level,
        call_wall=call_wall,
        put_wall=put_wall,
        gex_bias=gex_bias,
        ce_gex_total=round(ce_gex_total, 2) if has_gex else None,
        pe_gex_total=round(pe_gex_total, 2) if has_gex else None,
    )


def _find_gamma_flip(strikes: list["OIEChainStrikeRow"]) -> int | None:
    """Return the strike closest to where cumulative GEX (from highest strike down) changes sign."""
    gex_pairs = sorted(
        [(s.strike_price, s.net_gex) for s in strikes if s.net_gex is not None],
        key=lambda x: x[0],
    )
    if not gex_pairs:
        return None

    cumulative = 0.0
    prev_cumulative = 0.0
    prev_strike = gex_pairs[-1][0]

    for strike, gex in reversed(gex_pairs):
        cumulative += gex
        if prev_cumulative != 0.0 and prev_cumulative * cumulative < 0:
            return strike if abs(cumulative) < abs(prev_cumulative) else prev_strike
        prev_cumulative = cumulative
        prev_strike = strike

    return None
