"""
Intelligence Engine: converts raw analytics metrics into a
high-level market view suitable for direct presentation.

Rule: NEVER return raw numbers. Every value becomes a human-readable
interpretation label + one-sentence explanation.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class OIEIntelligenceReport:
    market_bias: str = "Neutral"          # Bullish | Bearish | Neutral | Mixed
    confidence_score: float = 50.0        # 0–100
    volatility_regime: str = "Normal"     # Compressed | Normal | Elevated | Extreme
    gamma_regime: str = "Neutral"         # Strongly Positive | Positive | Negative | Strongly Negative | Neutral
    dealer_positioning: str = "Neutral"   # Stabilising | Amplifying | Neutral
    expected_move_daily: str = "N/A"      # e.g. "±0.8%"
    expected_move_weekly: str = "N/A"     # e.g. "±2.1%"
    option_seller_favorability: str = "Medium"  # High | Medium | Low
    key_levels: dict[str, Any] = field(default_factory=dict)
    interpretation_bullets: list[str] = field(default_factory=list)
    metric_summary: dict[str, str] = field(default_factory=dict)


def build_intelligence(
    metrics: dict[str, dict[str, Any]],
    chain: Any,  # OIEChainResponse
) -> OIEIntelligenceReport:
    report = OIEIntelligenceReport()

    # ── scoring accumulators ─────────────────────────────────────────────────
    bull_score = 0.0
    bear_score = 0.0
    bull_reasons: list[str] = []
    bear_reasons: list[str] = []
    neutral_reasons: list[str] = []

    # ── PCR ──────────────────────────────────────────────────────────────────
    pcr_m = metrics.get("pcr", {})
    pcr_val = pcr_m.get("value")
    if pcr_val is not None:
        if pcr_val > 1.1:
            bear_score += 15
            bear_reasons.append(f"PCR {pcr_val:.2f} → Put-heavy positioning, bearish bias")
        elif pcr_val < 0.85:
            bull_score += 15
            bull_reasons.append(f"PCR {pcr_val:.2f} → Call-heavy positioning, bullish bias")
        else:
            neutral_reasons.append(f"PCR {pcr_val:.2f} → Balanced OI, no directional lean")

    # ── OI Momentum ──────────────────────────────────────────────────────────
    oi_mom = metrics.get("oi_momentum", {})
    oi_mom_val = oi_mom.get("value")
    if oi_mom_val is not None:
        if oi_mom_val > 50_000:
            bull_score += 10
            bull_reasons.append("Call OI building faster — fresh bullish writers entering")
        elif oi_mom_val < -50_000:
            bear_score += 10
            bear_reasons.append("Put OI building faster — fresh bearish writers entering")

    # ── GEX / Gamma Regime ───────────────────────────────────────────────────
    gex_m = metrics.get("gex", {})
    gex_val = gex_m.get("value")
    gr_m = metrics.get("gamma_regime", {})
    gr_fmt = gr_m.get("formatted", "Unknown")
    if gex_val is not None:
        if gex_val > 0:
            bull_score += 8
            bull_reasons.append(f"Positive GEX — dealers stabilising, mean-reversion conditions")
        else:
            bear_score += 5
            neutral_reasons.append("Negative GEX — dealers amplifying, momentum conditions")
    report.gamma_regime = gr_fmt if gr_fmt != "Unknown" else "Neutral"

    # ── Dealer Hedging Pressure ───────────────────────────────────────────────
    hp_m = metrics.get("hedging_pressure", {})
    hp_fmt = hp_m.get("formatted", "Neutral")
    report.dealer_positioning = hp_fmt

    # ── Volatility Regime + Seller Favorability ───────────────────────────────
    vr_m = metrics.get("vol_regime", {})
    vr_fmt = vr_m.get("formatted", "Normal")
    report.volatility_regime = vr_fmt

    iv_rank_m = metrics.get("iv_rank", {})
    iv_rank_val = iv_rank_m.get("value")
    if iv_rank_val is not None:
        if iv_rank_val > 70:
            report.option_seller_favorability = "High"
            bull_reasons.append(f"IV Rank {iv_rank_val:.0f} — premium-rich environment, favour option selling")
        elif iv_rank_val > 45:
            report.option_seller_favorability = "Medium"
            neutral_reasons.append(f"IV Rank {iv_rank_val:.0f} — moderate premium")
        else:
            report.option_seller_favorability = "Low"
            neutral_reasons.append(f"IV Rank {iv_rank_val:.0f} — cheap options, buying vol preferred")
    elif vr_fmt in ("Elevated", "Extreme"):
        report.option_seller_favorability = "High"
    elif vr_fmt == "Compressed":
        report.option_seller_favorability = "Low"

    # ── Expected Move ─────────────────────────────────────────────────────────
    em_m = metrics.get("expected_move", {})
    em_raw = em_m.get("raw", {})
    if em_raw:
        dp = em_raw.get("daily_pct")
        wp = em_raw.get("weekly_pct")
        da = em_raw.get("daily_em")
        wa = em_raw.get("weekly_em")
        if dp is not None:
            report.expected_move_daily = f"±{dp}% (±{da:.0f} pts)"
        if wp is not None:
            report.expected_move_weekly = f"±{wp}% (±{wa:.0f} pts)"

    # ── IV Skew ───────────────────────────────────────────────────────────────
    skew_m = metrics.get("iv_skew", {})
    skew_val = skew_m.get("value")
    if skew_val is not None:
        if skew_val > 3:
            bear_score += 8
            bear_reasons.append(f"Negative skew ({skew_val:+.1f}%) — market pricing downside protection aggressively")
        elif skew_val < -1:
            bull_score += 5
            bull_reasons.append(f"Positive skew ({skew_val:+.1f}%) — call side more expensive, speculative buying")

    # ── Pin Risk ──────────────────────────────────────────────────────────────
    pin_m = metrics.get("pin_risk", {})
    pin_fmt = pin_m.get("formatted", "Low")
    if pin_fmt == "High":
        neutral_reasons.append("High pin risk — expiry pinning likely, avoid large directional bets")

    # ── Key Levels ────────────────────────────────────────────────────────────
    agg = chain.aggregates if hasattr(chain, "aggregates") else None
    report.key_levels = {
        "call_wall": agg.call_wall if agg else None,
        "put_wall": agg.put_wall if agg else None,
        "gamma_flip": agg.gamma_flip_level if agg else None,
        "max_pain": chain.max_pain if hasattr(chain, "max_pain") else None,
        "spot": chain.spot_price if hasattr(chain, "spot_price") else None,
        "atm": chain.atm_strike if hasattr(chain, "atm_strike") else None,
    }

    # ── Market Bias + Confidence ──────────────────────────────────────────────
    total = bull_score + bear_score
    if total < 5:
        report.market_bias = "Neutral"
        confidence = 30.0
    elif bull_score > bear_score * 1.5:
        report.market_bias = "Bullish"
        confidence = min(90, 40 + bull_score * 1.2)
    elif bear_score > bull_score * 1.5:
        report.market_bias = "Bearish"
        confidence = min(90, 40 + bear_score * 1.2)
    elif abs(bull_score - bear_score) < 5:
        report.market_bias = "Mixed"
        confidence = 40.0
    else:
        report.market_bias = "Neutral"
        confidence = 35.0
    report.confidence_score = round(confidence, 1)

    # ── Interpretation bullets ────────────────────────────────────────────────
    bullets: list[str] = []
    if bull_reasons:
        bullets.extend(bull_reasons[:3])
    if bear_reasons:
        bullets.extend(bear_reasons[:3])
    if neutral_reasons:
        bullets.extend(neutral_reasons[:2])
    if not bullets:
        bullets.append("Insufficient options data for strong directional signal")
    report.interpretation_bullets = bullets[:7]

    # ── Metric summary (card-level) ────────────────────────────────────────────
    report.metric_summary = {
        "pcr": metrics.get("pcr", {}).get("formatted", "N/A"),
        "atm_iv": metrics.get("atm_iv", {}).get("formatted", "N/A"),
        "iv_rank": metrics.get("iv_rank", {}).get("formatted", "N/A"),
        "gex": metrics.get("gex", {}).get("formatted", "N/A"),
        "call_wall": metrics.get("call_wall", {}).get("formatted", "N/A"),
        "put_wall": metrics.get("put_wall", {}).get("formatted", "N/A"),
        "max_pain": metrics.get("max_pain", {}).get("formatted", "N/A"),
        "gamma_flip": metrics.get("gamma_flip", {}).get("formatted", "N/A"),
        "expected_move": metrics.get("expected_move", {}).get("formatted", "N/A"),
        "iv_skew": metrics.get("iv_skew", {}).get("formatted", "N/A"),
    }
    return report
