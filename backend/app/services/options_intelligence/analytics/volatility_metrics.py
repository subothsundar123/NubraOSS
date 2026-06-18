"""Volatility metrics: IV Rank, IV Percentile, Expected Move, IV Skew,
Volatility Regime, Term Structure."""
from __future__ import annotations

import math
from . import AnalyticsContext, BaseMetric, MetricResult


class ATMIVMetric(BaseMetric):
    """ATM implied volatility — the market's current fear/greed price."""
    key = "atm_iv"
    label = "ATM Implied Volatility"
    group = "volatility"

    def compute(self, ctx: AnalyticsContext) -> MetricResult:
        atm = ctx.chain.atm_strike
        strikes = ctx.chain.strikes
        if atm is None:
            return MetricResult(key=self.key, label=self.label, value=None,
                                formatted="N/A", interpretation="No ATM strike", group=self.group)
        atm_row = next((s for s in strikes if s.is_atm), None)
        if atm_row is None:
            atm_row = min(strikes, key=lambda s: abs(s.strike_price - atm))
        iv_raw = atm_row.ce_iv or atm_row.pe_iv
        if iv_raw is None:
            return MetricResult(key=self.key, label=self.label, value=None,
                                formatted="N/A", interpretation="IV unavailable for ATM strike", group=self.group)
        # Nubra API returns IV as decimal (0.1255 = 12.55%) — normalise to %
        iv = iv_raw * 100 if iv_raw < 2 else iv_raw
        if iv > 30:
            interp, trend = f"High ATM IV ({iv:.1f}%) — expensive options, favour selling premium", "up"
        elif iv > 18:
            interp, trend = f"Elevated ATM IV ({iv:.1f}%) — above normal volatility", "up"
        elif iv > 12:
            interp, trend = f"Normal ATM IV ({iv:.1f}%) — balanced premium environment", "neutral"
        else:
            interp, trend = f"Compressed ATM IV ({iv:.1f}%) — cheap options, consider buying vol", "down"
        return MetricResult(key=self.key, label=self.label, value=iv,
                            formatted=f"{iv:.1f}%", interpretation=interp,
                            group=self.group, trend=trend)


class IVRankMetric(BaseMetric):
    """IV Rank = (current IV − 52w low) / (52w high − 52w low) × 100."""
    key = "iv_rank"
    label = "IV Rank"
    group = "volatility"

    def compute(self, ctx: AnalyticsContext) -> MetricResult:
        history = ctx.iv_history
        atm_row = next((s for s in ctx.chain.strikes if s.is_atm), None)
        iv_raw = (atm_row.ce_iv or atm_row.pe_iv) if atm_row else None

        if iv_raw is None or not history:
            return MetricResult(key=self.key, label=self.label, value=None,
                                formatted="N/A",
                                interpretation="Insufficient history for IV Rank (need 30+ days)",
                                group=self.group)

        # Nubra API returns IV as decimal; DB history is stored in % — normalise
        current_iv = iv_raw * 100 if iv_raw < 2 else iv_raw

        ivs = [row["atm_iv"] for row in history if row.get("atm_iv") is not None]
        if len(ivs) < 10:
            return MetricResult(key=self.key, label=self.label, value=None,
                                formatted="N/A",
                                interpretation=f"Building IV history ({len(ivs)} days recorded)",
                                group=self.group)

        iv_low, iv_high = min(ivs), max(ivs)
        if iv_high == iv_low:
            return MetricResult(key=self.key, label=self.label, value=50.0,
                                formatted="50", interpretation="IV range too narrow to rank", group=self.group)

        rank = round((current_iv - iv_low) / (iv_high - iv_low) * 100, 1)
        if rank > 80:
            interp = f"Very High IV Rank ({rank}) — IV near 1-year high, premium very rich"
            trend = "up"
        elif rank > 50:
            interp = f"High IV Rank ({rank}) — above-average premium, favour selling"
            trend = "up"
        elif rank > 25:
            interp = f"Low-to-Normal IV Rank ({rank}) — fair premium environment"
            trend = "neutral"
        else:
            interp = f"Low IV Rank ({rank}) — IV near 1-year lows, cheap options"
            trend = "down"
        return MetricResult(key=self.key, label=self.label, value=rank,
                            formatted=str(rank), interpretation=interp,
                            group=self.group, trend=trend,
                            raw={"iv_low": iv_low, "iv_high": iv_high, "current_iv": current_iv})


class IVPercentileMetric(BaseMetric):
    """IV Percentile = % of days in history where IV was lower than today."""
    key = "iv_percentile"
    label = "IV Percentile"
    group = "volatility"

    def compute(self, ctx: AnalyticsContext) -> MetricResult:
        history = ctx.iv_history
        atm_row = next((s for s in ctx.chain.strikes if s.is_atm), None)
        iv_raw = (atm_row.ce_iv or atm_row.pe_iv) if atm_row else None

        if iv_raw is None or not history:
            return MetricResult(key=self.key, label=self.label, value=None,
                                formatted="N/A", interpretation="Insufficient history", group=self.group)

        current_iv = iv_raw * 100 if iv_raw < 2 else iv_raw  # normalise to %

        ivs = [row["atm_iv"] for row in history if row.get("atm_iv") is not None]
        if len(ivs) < 10:
            return MetricResult(key=self.key, label=self.label, value=None,
                                formatted="N/A",
                                interpretation=f"Building history ({len(ivs)} days)",
                                group=self.group)

        pct = round(sum(1 for v in ivs if v < current_iv) / len(ivs) * 100, 1)
        if pct > 80:
            interp = f"IV Pct {pct}% — options expensive vs recent history"
            trend = "up"
        elif pct > 50:
            interp = f"IV Pct {pct}% — slightly above median"
            trend = "up"
        else:
            interp = f"IV Pct {pct}% — options cheap vs recent history"
            trend = "down"
        return MetricResult(key=self.key, label=self.label, value=pct,
                            formatted=f"{pct}%", interpretation=interp,
                            group=self.group, trend=trend)


class ExpectedMoveMetric(BaseMetric):
    """Expected 1-day and 1-week move derived from ATM straddle price."""
    key = "expected_move"
    label = "Expected Move"
    group = "volatility"

    def compute(self, ctx: AnalyticsContext) -> MetricResult:
        chain = ctx.chain
        straddle = chain.straddle_price
        spot = chain.spot_price
        if straddle is None or not spot or spot <= 0:
            return MetricResult(key=self.key, label=self.label, value=None,
                                formatted="N/A", interpretation="Cannot compute without straddle price",
                                group=self.group)

        # Adjust for DTE: straddle prices sqrt(DTE) days of expected move.
        # Divide by sqrt(DTE) to extract the single-day component.
        expiry_str = getattr(chain, "expiry", None)
        dte = 1
        if expiry_str:
            try:
                from datetime import date as _date
                exp = _date(int(expiry_str[:4]), int(expiry_str[4:6]), int(expiry_str[6:8]))
                dte = max(1, (exp - _date.today()).days)
            except Exception:
                dte = 1

        daily_em = round(straddle * 0.68 / math.sqrt(dte), 1)
        daily_pct = round(daily_em / spot * 100, 2)
        weekly_em = round(daily_em * math.sqrt(5), 1)
        weekly_pct = round(weekly_em / spot * 100, 2)

        dte_note = f" ({dte}D to expiry)" if dte > 1 else ""
        interp = (f"Market pricing ±{daily_pct}% daily (±{daily_em} pts){dte_note} "
                  f"| ±{weekly_pct}% weekly (±{weekly_em} pts)")
        return MetricResult(key=self.key, label=self.label, value=daily_pct,
                            formatted=f"±{daily_pct}% / day",
                            interpretation=interp, group=self.group, trend="neutral",
                            raw={"daily_em": daily_em, "daily_pct": daily_pct,
                                 "weekly_em": weekly_em, "weekly_pct": weekly_pct,
                                 "straddle": straddle, "spot": spot, "dte": dte})


class IVSkewMetric(BaseMetric):
    """25-delta skew ≈ OTM put IV − OTM call IV at equal distance from ATM."""
    key = "iv_skew"
    label = "IV Skew"
    group = "volatility"

    def compute(self, ctx: AnalyticsContext) -> MetricResult:
        strikes = ctx.chain.strikes
        spot = ctx.chain.spot_price
        if not spot:
            return MetricResult(key=self.key, label=self.label, value=None,
                                formatted="N/A", interpretation="No spot price", group=self.group)

        # Find strikes ~2% OTM on each side
        target_dist = spot * 0.02
        otm_put = min(
            (s for s in strikes if s.strike_price < spot and s.pe_iv is not None),
            key=lambda s: abs(abs(s.distance_from_spot) - target_dist),
            default=None,
        )
        otm_call = min(
            (s for s in strikes if s.strike_price > spot and s.ce_iv is not None),
            key=lambda s: abs(abs(s.distance_from_spot) - target_dist),
            default=None,
        )

        if otm_put is None or otm_call is None:
            return MetricResult(key=self.key, label=self.label, value=None,
                                formatted="N/A", interpretation="Insufficient IV data for skew", group=self.group)

        # Nubra returns IV as decimal (0.145 = 14.5%) — normalise to % before differencing
        put_iv_pct = (otm_put.pe_iv or 0)
        call_iv_pct = (otm_call.ce_iv or 0)
        if put_iv_pct < 2:
            put_iv_pct = put_iv_pct * 100
        if call_iv_pct < 2:
            call_iv_pct = call_iv_pct * 100
        skew = round(put_iv_pct - call_iv_pct, 2)
        if skew > 4:
            interp = f"Strong negative skew ({skew}%) — market paying up for downside protection"
            trend = "down"
        elif skew > 1:
            interp = f"Mild negative skew ({skew}%) — slight downside protection premium"
            trend = "down"
        elif skew < -1:
            interp = f"Positive skew ({skew}%) — call side more expensive, bullish speculation"
            trend = "up"
        else:
            interp = f"Flat skew ({skew}%) — balanced directional risk pricing"
            trend = "neutral"
        return MetricResult(key=self.key, label=self.label, value=skew,
                            formatted=f"{skew:+.2f}%", interpretation=interp,
                            group=self.group, trend=trend,
                            raw={"put_iv_pct": put_iv_pct, "call_iv_pct": call_iv_pct,
                                 "put_strike": otm_put.strike_price, "call_strike": otm_call.strike_price})


class VolRegimeMetric(BaseMetric):
    """Classify volatility regime from IV Percentile."""
    key = "vol_regime"
    label = "Volatility Regime"
    group = "volatility"

    def compute(self, ctx: AnalyticsContext) -> MetricResult:
        history = ctx.iv_history
        atm_row = next((s for s in ctx.chain.strikes if s.is_atm), None)
        iv_raw = (atm_row.ce_iv or atm_row.pe_iv) if atm_row else None

        if iv_raw is None:
            return MetricResult(key=self.key, label=self.label, value=None,
                                formatted="Unknown", interpretation="IV unavailable", group=self.group)

        # Normalise to % (Nubra returns decimal 0.125 = 12.5%)
        current_iv = iv_raw * 100 if iv_raw < 2 else iv_raw

        ivs = [row["atm_iv"] for row in history if row.get("atm_iv") is not None]
        if len(ivs) < 10:
            # Fallback to absolute thresholds
            pct = None
        else:
            pct = sum(1 for v in ivs if v < current_iv) / len(ivs) * 100

        if pct is None:
            if current_iv > 25:
                regime, trend = "Extreme", "up"
            elif current_iv > 18:
                regime, trend = "Elevated", "up"
            elif current_iv > 12:
                regime, trend = "Normal", "neutral"
            else:
                regime, trend = "Compressed", "down"
        else:
            if pct > 85:
                regime, trend = "Extreme", "up"
            elif pct > 65:
                regime, trend = "Elevated", "up"
            elif pct > 35:
                regime, trend = "Normal", "neutral"
            else:
                regime, trend = "Compressed", "down"

        regime_descriptions = {
            "Extreme": "Extreme Volatility — options very expensive, favour wide strangles or iron condors",
            "Elevated": "Elevated Volatility — above-average premium, sellers have edge",
            "Normal": "Normal Volatility — standard premium, use balanced strategies",
            "Compressed": "Compressed Volatility — cheap options, vol expansion imminent, favour buying",
        }
        return MetricResult(key=self.key, label=self.label, value=current_iv,
                            formatted=regime, interpretation=regime_descriptions[regime],
                            group=self.group, trend=trend, raw={"regime": regime, "iv": current_iv})
