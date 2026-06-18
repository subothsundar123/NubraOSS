"""Dealer / Greeks metrics: GEX, Vanna Exposure, Charm Exposure,
Gamma Flip Level, Pin Risk, Hedging Pressure."""
from __future__ import annotations

from . import AnalyticsContext, BaseMetric, MetricResult


def _fmt_gex(v: float) -> str:
    """Format GEX in crore rupees for readability."""
    crore = v / 1e7
    if abs(crore) >= 1000:
        return f"₹{crore/1000:.1f}KCr"
    if abs(crore) >= 1:
        return f"₹{crore:.1f}Cr"
    return f"₹{v/1e5:.1f}L"


class GEXMetric(BaseMetric):
    """Dealer Gamma Exposure — total directional gamma risk in the market."""
    key = "gex"
    label = "Gamma Exposure (GEX)"
    group = "dealer"

    def compute(self, ctx: AnalyticsContext) -> MetricResult:
        agg = ctx.chain.aggregates
        gex = agg.total_gex
        if gex is None:
            return MetricResult(key=self.key, label=self.label, value=None,
                                formatted="N/A",
                                interpretation="GEX unavailable — gamma not in broker payload",
                                group=self.group)
        fmt = _fmt_gex(gex)
        if gex > 0:
            interp = (f"Positive GEX ({fmt}) — Dealers long gamma, buy dips / sell rallies. "
                      "Market self-stabilising, lower realised vol expected.")
            trend = "up"
        elif gex < 0:
            interp = (f"Negative GEX ({fmt}) — Dealers short gamma, forced to chase moves. "
                      "Reflexive, amplified swings expected.")
            trend = "down"
        else:
            interp = "Neutral GEX — balanced dealer positioning"
            trend = "neutral"
        return MetricResult(key=self.key, label=self.label, value=gex,
                            formatted=fmt, interpretation=interp,
                            group=self.group, trend=trend,
                            raw={"ce_gex": agg.ce_gex_total, "pe_gex": agg.pe_gex_total})


class GammaRegimeMetric(BaseMetric):
    """Classify gamma regime from GEX magnitude and sign."""
    key = "gamma_regime"
    label = "Gamma Regime"
    group = "dealer"

    def compute(self, ctx: AnalyticsContext) -> MetricResult:
        agg = ctx.chain.aggregates
        gex = agg.total_gex
        if gex is None:
            return MetricResult(key=self.key, label=self.label, value=None,
                                formatted="Unknown",
                                interpretation="Gamma data unavailable",
                                group=self.group)
        spot = ctx.chain.spot_price
        if spot is None or spot <= 0:
            return MetricResult(key=self.key, label=self.label, value=gex,
                                formatted="Unknown",
                                interpretation="Spot price unavailable — cannot classify gamma regime",
                                group=self.group)
        gex_pct = abs(gex) / (spot * 1e6) * 100  # normalised magnitude vs notional

        if gex > 0:
            if gex_pct > 5:
                label, interp = "Strongly Positive", "Very strong stabilising force — significant mean-reversion expected"
            else:
                label, interp = "Positive", "Dealers long gamma — modest stabilisation, balanced movement"
            trend = "up"
        else:
            if gex_pct > 5:
                label, interp = "Strongly Negative", "Very strong amplifying force — expect large directional moves"
            else:
                label, interp = "Negative", "Dealers short gamma — slight amplification, trend-following conditions"
            trend = "down"
        return MetricResult(key=self.key, label=self.label, value=gex,
                            formatted=label, interpretation=interp,
                            group=self.group, trend=trend)


class GammaFlipMetric(BaseMetric):
    """The price level where GEX changes sign — key dealer hedging pivot."""
    key = "gamma_flip"
    label = "Gamma Flip Level"
    group = "dealer"

    def compute(self, ctx: AnalyticsContext) -> MetricResult:
        flip = ctx.chain.aggregates.gamma_flip_level
        spot = ctx.chain.spot_price
        if flip is None:
            return MetricResult(key=self.key, label=self.label, value=None,
                                formatted="N/A",
                                interpretation="No gamma flip detected in current strikes",
                                group=self.group)
        if spot:
            diff = flip - spot
            sign = "+" if diff >= 0 else ""
            dist = f" ({sign}{diff:.0f} from spot)"
        else:
            dist = ""
        if spot and flip > spot:
            interp = f"Gamma flip at {flip}{dist} — spot below flip, negative gamma conditions active"
            trend = "down"
        elif spot and flip < spot:
            interp = f"Gamma flip at {flip}{dist} — spot above flip, positive gamma conditions active"
            trend = "up"
        else:
            interp = f"Gamma flip at {flip} — spot near the flip level, regime uncertain"
            trend = "neutral"
        return MetricResult(key=self.key, label=self.label, value=float(flip),
                            formatted=str(flip), interpretation=interp,
                            group=self.group, trend=trend)


class VannaExposureMetric(BaseMetric):
    """Vanna exposure: how much dealer delta changes with IV moves (proxy)."""
    key = "vanna_exposure"
    label = "Vanna Exposure"
    group = "dealer"

    def compute(self, ctx: AnalyticsContext) -> MetricResult:
        lot_size = ctx.chain.lot_size
        spot = ctx.chain.spot_price or 0
        strikes = ctx.chain.strikes

        vanna_total = 0.0
        count = 0
        for s in strikes:
            # Proxy: vanna ≈ vega × (1 − |delta|) / iv  (simplified)
            # Nubra returns IV as decimal (0.125 = 12.5%) — use directly as denominator.
            if s.ce_vega is not None and s.ce_delta is not None and s.ce_iv is not None and s.ce_oi is not None:
                vanna_ce = s.ce_vega * (1 - abs(s.ce_delta)) / max(s.ce_iv, 0.001)
                vanna_total += vanna_ce * s.ce_oi * lot_size
                count += 1
            if s.pe_vega is not None and s.pe_delta is not None and s.pe_iv is not None and s.pe_oi is not None:
                vanna_pe = s.pe_vega * (1 - abs(s.pe_delta)) / max(s.pe_iv, 0.001)
                vanna_total -= vanna_pe * s.pe_oi * lot_size  # puts subtract
                count += 1

        if count == 0:
            return MetricResult(key=self.key, label=self.label, value=None,
                                formatted="N/A",
                                interpretation="Vanna proxy unavailable — need vega + delta + iv",
                                group=self.group)
        fmt = _fmt_gex(abs(vanna_total))
        if vanna_total > 0:
            interp = (f"Positive Vanna ({fmt}) — IV rise → dealers buy delta (upward pressure), "
                      "IV fall → dealers sell delta (downward pressure)")
            trend = "up"
        else:
            interp = (f"Negative Vanna ({fmt}) — IV rise → dealers sell delta (downward), "
                      "IV fall → dealers buy delta (upward)")
            trend = "down"
        return MetricResult(key=self.key, label=self.label, value=round(vanna_total, 2),
                            formatted=fmt, interpretation=interp,
                            group=self.group, trend=trend)


class CharmExposureMetric(BaseMetric):
    """Charm exposure: how much dealer delta decays with time (time-decay hedging)."""
    key = "charm_exposure"
    label = "Charm Exposure"
    group = "dealer"

    def compute(self, ctx: AnalyticsContext) -> MetricResult:
        lot_size = ctx.chain.lot_size
        strikes = ctx.chain.strikes

        charm_total = 0.0
        count = 0
        for s in strikes:
            # Proxy: charm ≈ theta × delta / max(ltp, min_ltp) — clamp ltp to avoid OTM blow-up
            # min_ltp = 1.0 rupee prevents near-zero OTM options from dominating
            min_ltp = 1.0
            if s.ce_theta is not None and s.ce_delta is not None and s.ce_ltp is not None and s.ce_oi is not None and s.ce_ltp > 0:
                charm_ce = (s.ce_theta * abs(s.ce_delta)) / max(s.ce_ltp, min_ltp)
                charm_total += charm_ce * s.ce_oi * lot_size
                count += 1
            if s.pe_theta is not None and s.pe_delta is not None and s.pe_ltp is not None and s.pe_oi is not None and s.pe_ltp > 0:
                charm_pe = (s.pe_theta * abs(s.pe_delta)) / max(s.pe_ltp, min_ltp)
                charm_total -= charm_pe * s.pe_oi * lot_size
                count += 1

        if count == 0:
            return MetricResult(key=self.key, label=self.label, value=None,
                                formatted="N/A",
                                interpretation="Charm proxy unavailable — need theta + delta + ltp",
                                group=self.group)
        fmt = _fmt_gex(abs(charm_total))
        if charm_total > 0:
            interp = (f"Positive Charm ({fmt}) — time passage → dealers need to buy delta "
                      "(upward drift bias near expiry)")
            trend = "up"
        else:
            interp = (f"Negative Charm ({fmt}) — time passage → dealers need to sell delta "
                      "(downward drift bias near expiry)")
            trend = "down"
        return MetricResult(key=self.key, label=self.label, value=round(charm_total, 4),
                            formatted=fmt, interpretation=interp,
                            group=self.group, trend=trend)


class HedgingPressureMetric(BaseMetric):
    """Combined dealer hedging direction from GEX + Vanna + Charm."""
    key = "hedging_pressure"
    label = "Dealer Hedging Pressure"
    group = "dealer"

    def compute(self, ctx: AnalyticsContext) -> MetricResult:
        agg = ctx.chain.aggregates
        gex = agg.total_gex or 0
        bias = agg.gex_bias

        spot = ctx.chain.spot_price or 0

        # Score: +1 for each bullish signal, -1 for bearish
        score = 0
        factors: list[str] = []

        if bias == "positive":
            score += 1
            factors.append("Positive GEX → buy dips, sell rallies (stabilising)")
        elif bias == "negative":
            score -= 1
            factors.append("Negative GEX → chase moves (amplifying)")

        gfl = agg.gamma_flip_level
        if gfl and spot:
            if spot > gfl:
                score += 1
                factors.append(f"Above gamma flip ({gfl}) → positive gamma territory")
            else:
                score -= 1
                factors.append(f"Below gamma flip ({gfl}) → negative gamma territory")

        if score >= 1:
            direction, trend = "Stabilising", "up"
            interp = "Dealers buying weakness, selling strength — expect mean reversion"
        elif score <= -1:
            direction, trend = "Amplifying", "down"
            interp = "Dealers following price direction — expect momentum continuation"
        else:
            direction, trend = "Neutral", "neutral"
            interp = "Mixed hedging signals — no dominant dealer flow direction"

        return MetricResult(key=self.key, label=self.label, value=float(score),
                            formatted=direction, interpretation=interp,
                            group=self.group, trend=trend,
                            raw={"score": score, "factors": factors})


class PinRiskMetric(BaseMetric):
    """How likely is price to pin at max pain near expiry."""
    key = "pin_risk"
    label = "Pin Risk"
    group = "dealer"

    def compute(self, ctx: AnalyticsContext) -> MetricResult:
        chain = ctx.chain
        mp = chain.max_pain
        spot = chain.spot_price
        concentration = None

        # Get OI concentration from context
        oi_per_strike = sorted(
            [(s.strike_price, (s.ce_oi or 0) + (s.pe_oi or 0)) for s in chain.strikes],
            key=lambda x: x[1], reverse=True,
        )
        total_oi = sum(v for _, v in oi_per_strike)
        if total_oi > 0 and oi_per_strike:
            top3_oi = sum(v for _, v in oi_per_strike[:3])
            concentration = top3_oi / total_oi * 100

        if mp is None or spot is None:
            return MetricResult(key=self.key, label=self.label, value=None,
                                formatted="N/A", interpretation="Need max pain + spot for pin risk",
                                group=self.group)

        dist_pct = abs(spot - mp) / spot * 100
        high_conc = concentration is not None and concentration > 50

        if dist_pct < 0.5 and high_conc:
            level, trend = "High", "neutral"
            interp = f"High pin risk at {mp} — spot very close to max pain with concentrated OI"
        elif dist_pct < 1.0:
            level, trend = "Moderate", "neutral"
            interp = f"Moderate pin risk — spot {dist_pct:.1f}% from max pain ({mp})"
        else:
            level, trend = "Low", "neutral"
            interp = f"Low pin risk — spot {dist_pct:.1f}% from max pain ({mp}), free to trend"
        return MetricResult(key=self.key, label=self.label, value=dist_pct,
                            formatted=level, interpretation=interp,
                            group=self.group, trend=trend,
                            raw={"max_pain": mp, "spot": spot, "dist_pct": dist_pct,
                                 "concentration": concentration})
