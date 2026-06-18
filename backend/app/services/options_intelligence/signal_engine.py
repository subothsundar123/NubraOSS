"""
Signal Engine — converts analytics metrics into discrete, actionable signals.

Each signal has: key, label, direction (bullish/bearish/neutral), strength (1–10),
category, and a one-sentence reason.  Signals are aggregated into a composite
score used by both the Signals tab and the alert engine.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


UTC = timezone.utc


@dataclass
class Signal:
    key: str
    label: str
    direction: str          # "bullish" | "bearish" | "neutral"
    strength: int           # 1–10
    category: str           # "oi" | "volatility" | "dealer" | "composite"
    reason: str
    metric_key: str = ""
    metric_value: float | None = None
    metric_formatted: str = ""


@dataclass
class SignalReport:
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    underlying: str = ""
    generated_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    signals: list[Signal] = field(default_factory=list)
    composite_direction: str = "neutral"   # "bullish" | "bearish" | "neutral" | "mixed"
    composite_score: float = 50.0          # 0–100, 50 = neutral
    bull_score: float = 0.0
    bear_score: float = 0.0
    summary: str = ""
    top_signals: list[Signal] = field(default_factory=list)  # top 3 by strength


def _get(metrics: dict[str, Any], key: str) -> dict[str, Any]:
    return metrics.get(key) or {}


def _val(metrics: dict[str, Any], key: str) -> float | None:
    m = _get(metrics, key)
    v = m.get("value")
    return float(v) if v is not None else None


def _fmt(metrics: dict[str, Any], key: str) -> str:
    return _get(metrics, key).get("formatted", "N/A")


def build_signals(
    metrics: dict[str, Any],
    chain: Any,  # OIEChainResponse
) -> SignalReport:
    report = SignalReport(underlying=getattr(chain, "underlying", ""))
    signals: list[Signal] = []
    bull_pts = 0.0
    bear_pts = 0.0

    # ── PCR ──────────────────────────────────────────────────────────────────
    pcr = _val(metrics, "pcr")
    if pcr is not None:
        if pcr > 1.3:
            s = Signal("pcr_bear", "PCR Extreme Put Load", "bullish", 8, "oi",
                       f"PCR {pcr:.2f} — extreme put loading often precedes a relief rally",
                       "pcr", pcr, _fmt(metrics, "pcr"))
            signals.append(s); bull_pts += 8
        elif pcr > 1.1:
            s = Signal("pcr_put_heavy", "Put-Heavy OI", "bearish", 5, "oi",
                       f"PCR {pcr:.2f} — puts outweigh calls, bearish positioning dominant",
                       "pcr", pcr, _fmt(metrics, "pcr"))
            signals.append(s); bear_pts += 5
        elif pcr < 0.7:
            s = Signal("pcr_call_heavy", "Call-Heavy OI", "bearish", 6, "oi",
                       f"PCR {pcr:.2f} — extreme call loading, market may be overbought",
                       "pcr", pcr, _fmt(metrics, "pcr"))
            signals.append(s); bear_pts += 6
        elif pcr < 0.85:
            s = Signal("pcr_bull", "Call Dominance", "bullish", 5, "oi",
                       f"PCR {pcr:.2f} — calls outweigh puts, bullish bias",
                       "pcr", pcr, _fmt(metrics, "pcr"))
            signals.append(s); bull_pts += 5
        else:
            signals.append(Signal("pcr_neutral", "PCR Balanced", "neutral", 2, "oi",
                                  f"PCR {pcr:.2f} — balanced OI, no directional signal",
                                  "pcr", pcr, _fmt(metrics, "pcr")))

    # ── Dynamic PCR (volume-based) ────────────────────────────────────────────
    dpcr = _val(metrics, "dynamic_pcr")
    if dpcr is not None:
        if dpcr > 1.2:
            s = Signal("dpcr_bear", "Volume PCR Bearish", "bearish", 4, "oi",
                       f"Volume PCR {dpcr:.2f} — intraday put buying elevated",
                       "dynamic_pcr", dpcr, _fmt(metrics, "dynamic_pcr"))
            signals.append(s); bear_pts += 4
        elif dpcr < 0.8:
            s = Signal("dpcr_bull", "Volume PCR Bullish", "bullish", 4, "oi",
                       f"Volume PCR {dpcr:.2f} — intraday call buying elevated",
                       "dynamic_pcr", dpcr, _fmt(metrics, "dynamic_pcr"))
            signals.append(s); bull_pts += 4

    # ── OI Momentum ──────────────────────────────────────────────────────────
    oi_mom = _val(metrics, "oi_momentum")
    if oi_mom is not None:
        if oi_mom > 100_000:
            s = Signal("oi_mom_bull", "Strong Call OI Build", "bullish", 7, "oi",
                       "Call OI accumulating significantly — new bullish positions opening",
                       "oi_momentum", oi_mom, _fmt(metrics, "oi_momentum"))
            signals.append(s); bull_pts += 7
        elif oi_mom > 50_000:
            s = Signal("oi_mom_bull_mild", "Mild Call OI Build", "bullish", 4, "oi",
                       "Moderate call OI build — mild bullish lean",
                       "oi_momentum", oi_mom, _fmt(metrics, "oi_momentum"))
            signals.append(s); bull_pts += 4
        elif oi_mom < -100_000:
            s = Signal("oi_mom_bear", "Strong Put OI Build", "bearish", 7, "oi",
                       "Put OI accumulating significantly — new bearish positions opening",
                       "oi_momentum", oi_mom, _fmt(metrics, "oi_momentum"))
            signals.append(s); bear_pts += 7
        elif oi_mom < -50_000:
            s = Signal("oi_mom_bear_mild", "Mild Put OI Build", "bearish", 4, "oi",
                       "Moderate put OI build — mild bearish lean",
                       "oi_momentum", oi_mom, _fmt(metrics, "oi_momentum"))
            signals.append(s); bear_pts += 4

    # ── OI Imbalance ─────────────────────────────────────────────────────────
    oi_imb = _val(metrics, "oi_imbalance")
    if oi_imb is not None:
        if oi_imb > 25:
            s = Signal("oi_imb_bear", "OI Imbalance Bearish", "bearish", 5, "oi",
                       f"OI {oi_imb:.1f}% skewed toward puts — heavy downside hedging",
                       "oi_imbalance", oi_imb, _fmt(metrics, "oi_imbalance"))
            signals.append(s); bear_pts += 5
        elif oi_imb < -25:
            s = Signal("oi_imb_bull", "OI Imbalance Bullish", "bullish", 5, "oi",
                       f"OI {oi_imb:.1f}% skewed toward calls — heavy upside positioning",
                       "oi_imbalance", oi_imb, _fmt(metrics, "oi_imbalance"))
            signals.append(s); bull_pts += 5

    # ── Spot vs Call/Put Wall ─────────────────────────────────────────────────
    spot = getattr(chain, "spot_price", None)
    agg = getattr(chain, "aggregates", None)
    call_wall = getattr(agg, "call_wall", None) if agg else None
    put_wall = getattr(agg, "put_wall", None) if agg else None

    if spot and call_wall and 0 < (call_wall - spot) / spot < 0.01:
        s = Signal("call_wall_test", "Testing Call Wall", "bearish", 6, "oi",
                   f"Spot {spot:.0f} within 1% of Call Wall {call_wall:.0f} — strong resistance overhead",
                   "call_wall", call_wall, _fmt(metrics, "call_wall"))
        signals.append(s); bear_pts += 6
    if spot and put_wall and 0 < (spot - put_wall) / spot < 0.01:
        s = Signal("put_wall_test", "Testing Put Wall", "bullish", 6, "oi",
                   f"Spot {spot:.0f} within 1% of Put Wall {put_wall:.0f} — strong support below",
                   "put_wall", put_wall, _fmt(metrics, "put_wall"))
        signals.append(s); bull_pts += 6

    # ── GEX / Gamma Regime ───────────────────────────────────────────────────
    gex = _val(metrics, "gex")
    if gex is not None:
        if gex > 0:
            s = Signal("gex_pos", "Positive GEX — Stabilising", "bullish", 5, "dealer",
                       "Dealers long gamma — they sell rallies and buy dips, suppressing volatility",
                       "gex", gex, _fmt(metrics, "gex"))
            signals.append(s); bull_pts += 5
        else:
            s = Signal("gex_neg", "Negative GEX — Amplifying", "bearish", 5, "dealer",
                       "Dealers short gamma — they buy rallies and sell dips, amplifying moves",
                       "gex", gex, _fmt(metrics, "gex"))
            signals.append(s); bear_pts += 5

    # ── Spot vs Gamma Flip ────────────────────────────────────────────────────
    gamma_flip = _val(metrics, "gamma_flip")
    if spot and gamma_flip is not None:
        if spot > gamma_flip:
            s = Signal("above_gflip", "Above Gamma Flip", "bullish", 6, "dealer",
                       f"Spot {spot:.0f} above Gamma Flip {gamma_flip:.0f} — stabilising regime, support holds",
                       "gamma_flip", gamma_flip, _fmt(metrics, "gamma_flip"))
            signals.append(s); bull_pts += 6
        else:
            s = Signal("below_gflip", "Below Gamma Flip", "bearish", 7, "dealer",
                       f"Spot {spot:.0f} below Gamma Flip {gamma_flip:.0f} — amplifying regime, momentum likely",
                       "gamma_flip", gamma_flip, _fmt(metrics, "gamma_flip"))
            signals.append(s); bear_pts += 7

    # ── Vanna / Charm ─────────────────────────────────────────────────────────
    vanna = _val(metrics, "vanna_exposure")
    charm = _val(metrics, "charm_exposure")
    if vanna is not None and vanna > 0:
        s = Signal("vanna_bull", "Positive Vanna Flow", "bullish", 4, "dealer",
                   "Positive vanna — rising IV causes dealers to buy underlying (supportive)",
                   "vanna_exposure", vanna, _fmt(metrics, "vanna_exposure"))
        signals.append(s); bull_pts += 4
    elif vanna is not None and vanna < 0:
        s = Signal("vanna_bear", "Negative Vanna Flow", "bearish", 4, "dealer",
                   "Negative vanna — rising IV causes dealers to sell underlying (pressuring)",
                   "vanna_exposure", vanna, _fmt(metrics, "vanna_exposure"))
        signals.append(s); bear_pts += 4

    if charm is not None and charm > 0:
        s = Signal("charm_bull", "Positive Charm Flow", "bullish", 3, "dealer",
                   "Positive charm — time decay causes dealers to buy delta (supportive into expiry)",
                   "charm_exposure", charm, _fmt(metrics, "charm_exposure"))
        signals.append(s); bull_pts += 3

    # ── IV Rank ───────────────────────────────────────────────────────────────
    iv_rank = _val(metrics, "iv_rank")
    if iv_rank is not None:
        if iv_rank > 80:
            # High IV rank: premium-selling regime. Strength=5, neutral direction (strategy, not market call).
            s = Signal("iv_rank_high", "IV Rank Extreme — Sell Premium", "neutral", 5, "volatility",
                       f"IV Rank {iv_rank:.0f} — volatility historically elevated, premium selling favoured",
                       "iv_rank", iv_rank, _fmt(metrics, "iv_rank"))
            signals.append(s)
        elif iv_rank > 60:
            signals.append(Signal("iv_rank_elevated", "IV Elevated", "neutral", 4, "volatility",
                                  f"IV Rank {iv_rank:.0f} — above average IV, modest seller edge",
                                  "iv_rank", iv_rank, _fmt(metrics, "iv_rank")))
        elif iv_rank < 20:
            # Low IV rank: premium-buying regime. Neutral direction, slight bullish vol-expansion lean.
            s = Signal("iv_rank_low", "IV Rank Compressed — Buy Premium", "neutral", 5, "volatility",
                       f"IV Rank {iv_rank:.0f} — volatility historically cheap, long premium plays favoured",
                       "iv_rank", iv_rank, _fmt(metrics, "iv_rank"))
            signals.append(s)

    # ── IV Skew ───────────────────────────────────────────────────────────────
    skew = _val(metrics, "iv_skew")
    if skew is not None:
        if skew > 4:
            s = Signal("skew_bear", "Negative Skew — Downside Fear", "bearish", 7, "volatility",
                       f"IV skew {skew:+.1f}% — market aggressively pricing downside protection",
                       "iv_skew", skew, _fmt(metrics, "iv_skew"))
            signals.append(s); bear_pts += 7
        elif skew > 2:
            s = Signal("skew_mild_bear", "Mild Negative Skew", "bearish", 4, "volatility",
                       f"IV skew {skew:+.1f}% — modest put premium, cautious sentiment",
                       "iv_skew", skew, _fmt(metrics, "iv_skew"))
            signals.append(s); bear_pts += 4
        elif skew < -2:
            s = Signal("skew_bull", "Positive Skew — Upside Speculation", "bullish", 5, "volatility",
                       f"IV skew {skew:+.1f}% — calls more expensive, speculative bullish positioning",
                       "iv_skew", skew, _fmt(metrics, "iv_skew"))
            signals.append(s); bull_pts += 5

    # ── Vol Regime ────────────────────────────────────────────────────────────
    vr_fmt = _get(metrics, "vol_regime").get("formatted", "")
    if vr_fmt == "Extreme":
        s = Signal("vol_extreme", "Extreme Volatility Regime", "bearish", 8, "volatility",
                   "Vol regime Extreme — high uncertainty, reduce position sizes",
                   "vol_regime", None, vr_fmt)
        signals.append(s); bear_pts += 4
    elif vr_fmt == "Compressed":
        s = Signal("vol_compressed", "Compressed Volatility", "neutral", 5, "volatility",
                   "Vol regime Compressed — low IV may precede breakout, monitor for expansion",
                   "vol_regime", None, vr_fmt)
        signals.append(s)

    # ── Max Pain ─────────────────────────────────────────────────────────────
    max_pain = _val(metrics, "max_pain")
    if spot and max_pain is not None:
        diff_pct = (spot - max_pain) / max_pain * 100
        if diff_pct > 1.5:
            s = Signal("above_max_pain", "Spot Above Max Pain", "bearish", 4, "oi",
                       f"Spot {diff_pct:.1f}% above max pain {max_pain:.0f} — gravitational pull toward pain level",
                       "max_pain", max_pain, _fmt(metrics, "max_pain"))
            signals.append(s); bear_pts += 4
        elif diff_pct < -1.5:
            s = Signal("below_max_pain", "Spot Below Max Pain", "bullish", 4, "oi",
                       f"Spot {abs(diff_pct):.1f}% below max pain {max_pain:.0f} — gravitational pull upward",
                       "max_pain", max_pain, _fmt(metrics, "max_pain"))
            signals.append(s); bull_pts += 4

    # ── Composite Score ───────────────────────────────────────────────────────
    total = bull_pts + bear_pts
    if total == 0:
        composite_score = 50.0
        direction = "neutral"
    else:
        bull_pct = bull_pts / total * 100
        bear_pct = bear_pts / total * 100
        # Score: 0=pure bear, 50=neutral, 100=pure bull
        composite_score = round(bull_pct, 1)
        if bull_pct > 62:
            direction = "bullish"
        elif bear_pct > 62:
            direction = "bearish"
        elif abs(bull_pct - bear_pct) < 10:
            direction = "neutral"
        else:
            direction = "mixed"

    report.signals = signals
    report.bull_score = round(bull_pts, 1)
    report.bear_score = round(bear_pts, 1)
    report.composite_score = composite_score
    report.composite_direction = direction
    report.top_signals = sorted(
        [s for s in signals if s.direction != "neutral"],
        key=lambda s: s.strength,
        reverse=True,
    )[:5]

    # Summary sentence
    if direction == "bullish":
        report.summary = f"Bullish composite signal ({composite_score:.0f}/100) — {int(bull_pts)} bull points vs {int(bear_pts)} bear points"
    elif direction == "bearish":
        bear_strength = 100 - composite_score
        report.summary = f"Bearish composite signal ({bear_strength:.0f}/100) — {int(bear_pts)} bear points vs {int(bull_pts)} bull points"
    elif direction == "mixed":
        report.summary = f"Mixed signals — {int(bull_pts)} bull vs {int(bear_pts)} bear, no clear directional edge"
    else:
        report.summary = "Neutral market structure — no dominant signal"

    return report


def persist_signal_snapshot(report: SignalReport, environment: str) -> None:
    """Best-effort persist signal snapshot to SQLite."""
    try:
        import json
        from app.db import get_db_connection
        with get_db_connection() as conn:
            conn.execute(
                """insert or replace into oie_signal_snapshots
                   (id, underlying, environment, generated_at, composite_direction,
                    composite_score, bull_score, bear_score, summary, signals_json)
                   values (?,?,?,?,?,?,?,?,?,?)""",
                (
                    report.id,
                    report.underlying,
                    environment,
                    report.generated_at,
                    report.composite_direction,
                    report.composite_score,
                    report.bull_score,
                    report.bear_score,
                    report.summary,
                    json.dumps([s.__dict__ for s in report.signals]),
                ),
            )
    except Exception:
        pass
