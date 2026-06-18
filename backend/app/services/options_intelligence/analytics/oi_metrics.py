"""OI-based metrics: PCR, Dynamic PCR, OI Momentum, OI Concentration,
OI Shift, Call Wall, Put Wall, Max Pain, OI Imbalance."""
from __future__ import annotations

from . import AnalyticsContext, BaseMetric, MetricResult


# ── helpers ──────────────────────────────────────────────────────────────────

def _fmt_oi(v: float) -> str:
    if v >= 1_000_000:
        return f"{v/1_000_000:.2f}M"
    if v >= 1_000:
        return f"{v/1_000:.1f}K"
    return str(int(v))


# ── metrics ──────────────────────────────────────────────────────────────────

class PCRMetric(BaseMetric):
    key = "pcr"
    label = "Put-Call Ratio"
    group = "oi"

    def compute(self, ctx: AnalyticsContext) -> MetricResult:
        chain = ctx.chain
        pcr = chain.pcr
        if pcr is None:
            return MetricResult(key=self.key, label=self.label, value=None,
                                formatted="N/A", interpretation="No data", group=self.group)
        if pcr > 1.3:
            interp, trend = "Strong Put Bias — bearish positioning", "down"
        elif pcr > 1.0:
            interp, trend = "Mild Put Bias — cautious market", "down"
        elif pcr > 0.7:
            interp, trend = "Balanced — no clear directional bias", "neutral"
        elif pcr > 0.5:
            interp, trend = "Mild Call Bias — mild bullish positioning", "up"
        else:
            interp, trend = "Strong Call Bias — aggressive bullish positioning", "up"
        return MetricResult(key=self.key, label=self.label, value=pcr,
                            formatted=f"{pcr:.3f}", interpretation=interp,
                            group=self.group, trend=trend)


class DynamicPCRMetric(BaseMetric):
    """Volume-weighted PCR reflects real-time sentiment better than OI PCR."""
    key = "dynamic_pcr"
    label = "Dynamic PCR (Volume)"
    group = "oi"

    def compute(self, ctx: AnalyticsContext) -> MetricResult:
        strikes = ctx.chain.strikes
        ce_vol = sum(s.ce_volume or 0 for s in strikes)
        pe_vol = sum(s.pe_volume or 0 for s in strikes)
        if ce_vol <= 0:
            return MetricResult(key=self.key, label=self.label, value=None,
                                formatted="N/A", interpretation="No volume data", group=self.group)
        dpcr = round(pe_vol / ce_vol, 3)
        if dpcr > 1.2:
            interp, trend = "Heavy put volume — intraday bearish flow", "down"
        elif dpcr > 0.9:
            interp, trend = "Balanced intraday flow", "neutral"
        else:
            interp, trend = "Heavy call volume — intraday bullish flow", "up"
        return MetricResult(key=self.key, label=self.label, value=dpcr,
                            formatted=f"{dpcr:.3f}", interpretation=interp,
                            group=self.group, trend=trend,
                            raw={"ce_volume": ce_vol, "pe_volume": pe_vol})


class OIMomentumMetric(BaseMetric):
    """OI change vs previous snapshot — detects fresh buildup or unwinding."""
    key = "oi_momentum"
    label = "OI Momentum"
    group = "oi"

    def compute(self, ctx: AnalyticsContext) -> MetricResult:
        strikes = ctx.chain.strikes
        ce_oi_chg = sum(s.ce_oi_change or 0 for s in strikes)
        pe_oi_chg = sum(s.pe_oi_change or 0 for s in strikes)
        net = ce_oi_chg - pe_oi_chg

        if abs(net) < 10_000:
            interp, trend = "Minimal OI change — market in consolidation", "neutral"
        elif net > 0:
            interp = f"Call OI building faster (+{_fmt_oi(abs(net))}) — bullish writers adding"
            trend = "up"
        else:
            interp = f"Put OI building faster (+{_fmt_oi(abs(net))}) — bearish writers adding"
            trend = "down"
        return MetricResult(key=self.key, label=self.label, value=round(net, 0),
                            formatted=f"{'+'if net>=0 else ''}{_fmt_oi(abs(net))}",
                            interpretation=interp, group=self.group, trend=trend,
                            raw={"ce_oi_change": ce_oi_chg, "pe_oi_change": pe_oi_chg})


class OIConcentrationMetric(BaseMetric):
    """Top-5 strikes as % of total OI — high concentration → pin risk."""
    key = "oi_concentration"
    label = "OI Concentration"
    group = "oi"

    def compute(self, ctx: AnalyticsContext) -> MetricResult:
        strikes = ctx.chain.strikes
        oi_per_strike = sorted(
            [(s.strike_price, (s.ce_oi or 0) + (s.pe_oi or 0)) for s in strikes],
            key=lambda x: x[1], reverse=True,
        )
        total_oi = sum(v for _, v in oi_per_strike)
        if total_oi <= 0:
            return MetricResult(key=self.key, label=self.label, value=None,
                                formatted="N/A", interpretation="No OI data", group=self.group)
        top5_oi = sum(v for _, v in oi_per_strike[:5])
        concentration = round(top5_oi / total_oi * 100, 1)
        top5_strikes = [s for s, _ in oi_per_strike[:5]]

        if concentration > 60:
            interp = f"High concentration ({concentration}%) at {top5_strikes[:3]} — strong pin risk"
            trend = "down"
        elif concentration > 40:
            interp = f"Moderate concentration ({concentration}%) — some pinning possible"
            trend = "neutral"
        else:
            interp = f"Spread OI ({concentration}%) — low pin risk, range trading likely"
            trend = "neutral"
        return MetricResult(key=self.key, label=self.label, value=concentration,
                            formatted=f"{concentration}%", interpretation=interp,
                            group=self.group, trend=trend,
                            raw={"top5_strikes": top5_strikes, "total_oi": total_oi})


class OIImbalanceMetric(BaseMetric):
    """(Total CE OI - Total PE OI) / Total OI — directional lean."""
    key = "oi_imbalance"
    label = "OI Imbalance"
    group = "oi"

    def compute(self, ctx: AnalyticsContext) -> MetricResult:
        chain = ctx.chain
        ce = chain.total_ce_oi or 0
        pe = chain.total_pe_oi or 0
        total = ce + pe
        if total <= 0:
            return MetricResult(key=self.key, label=self.label, value=None,
                                formatted="N/A", interpretation="No OI data", group=self.group)
        imbalance = round((ce - pe) / total * 100, 1)
        if imbalance > 15:
            interp = f"Call-heavy OI (+{imbalance}%) — resistance overhead, bullish writers dominant"
            trend = "up"
        elif imbalance < -15:
            interp = f"Put-heavy OI ({imbalance}%) — support below, bearish writers dominant"
            trend = "down"
        else:
            interp = f"Balanced OI ({imbalance}%) — no strong directional lean"
            trend = "neutral"
        return MetricResult(key=self.key, label=self.label, value=imbalance,
                            formatted=f"{'+' if imbalance >= 0 else ''}{imbalance}%",
                            interpretation=interp, group=self.group, trend=trend,
                            raw={"total_ce_oi": ce, "total_pe_oi": pe})


class CallWallMetric(BaseMetric):
    """Strike with highest CE OI — acts as resistance."""
    key = "call_wall"
    label = "Call Wall"
    group = "oi"

    def compute(self, ctx: AnalyticsContext) -> MetricResult:
        cw = ctx.chain.aggregates.call_wall
        spot = ctx.chain.spot_price
        if cw is None:
            return MetricResult(key=self.key, label=self.label, value=None,
                                formatted="N/A", interpretation="No call OI data", group=self.group)
        dist = f" (+{cw - int(spot or 0)})" if spot else ""
        interp = f"Strong resistance at {cw}{dist} — call writers defending this level"
        return MetricResult(key=self.key, label=self.label, value=float(cw),
                            formatted=str(cw), interpretation=interp,
                            group=self.group, trend="down",
                            raw={"call_wall": cw, "spot_price": spot})


class PutWallMetric(BaseMetric):
    """Strike with highest PE OI — acts as support."""
    key = "put_wall"
    label = "Put Wall"
    group = "oi"

    def compute(self, ctx: AnalyticsContext) -> MetricResult:
        pw = ctx.chain.aggregates.put_wall
        spot = ctx.chain.spot_price
        if pw is None:
            return MetricResult(key=self.key, label=self.label, value=None,
                                formatted="N/A", interpretation="No put OI data", group=self.group)
        dist = f" (-{int(spot or 0) - pw})" if spot else ""
        interp = f"Strong support at {pw}{dist} — put writers defending this level"
        return MetricResult(key=self.key, label=self.label, value=float(pw),
                            formatted=str(pw), interpretation=interp,
                            group=self.group, trend="up",
                            raw={"put_wall": pw, "spot_price": spot})


class MaxPainMetric(BaseMetric):
    """Strike where option buyers lose the most at expiry."""
    key = "max_pain"
    label = "Max Pain"
    group = "oi"

    def compute(self, ctx: AnalyticsContext) -> MetricResult:
        mp = ctx.chain.max_pain
        spot = ctx.chain.spot_price
        if mp is None:
            return MetricResult(key=self.key, label=self.label, value=None,
                                formatted="N/A", interpretation="Cannot compute max pain", group=self.group)
        diff = round((mp - (spot or mp)) / (spot or mp) * 100, 2) if spot else 0
        sign = "+" if diff >= 0 else ""
        if abs(diff) < 0.3:
            interp = f"Spot near max pain ({mp}) — expect range compression near expiry"
            trend = "neutral"
        elif diff > 0:
            interp = f"Max pain {sign}{diff}% above spot — pull toward {mp} expected"
            trend = "up"
        else:
            interp = f"Max pain {diff}% below spot — pull toward {mp} expected"
            trend = "down"
        return MetricResult(key=self.key, label=self.label, value=float(mp),
                            formatted=str(mp), interpretation=interp,
                            group=self.group, trend=trend,
                            raw={"max_pain": mp, "spot_price": spot, "diff_pct": diff})
