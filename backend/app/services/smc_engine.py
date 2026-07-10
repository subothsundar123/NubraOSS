"""Smart Money Concepts engine — pure pandas/numpy, no I/O."""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd


@dataclass
class SmcZone:
    zone_type: str   # BULL_OB | BEAR_OB | BULL_FVG | BEAR_FVG | BSL | SSL
    high: float
    low: float
    strength: float
    status: str = "ACTIVE"
    candle_time: str = ""


@dataclass
class SmcEngineResult:
    trend: str               # BULLISH | BEARISH | RANGING
    last_signal: str         # BOS_UP | BOS_DOWN | CHOCH_UP | CHOCH_DOWN | NONE
    signal_price: float | None
    price_zone: str          # PREMIUM | DISCOUNT | EQUILIBRIUM
    confluence_score: float
    zones: list[SmcZone] = field(default_factory=list)
    bos_level: float | None = None
    choch_level: float | None = None
    signal_bars_ago: int | None = None   # bars since signal fired (None = no signal)


# ── Swing point detection ─────────────────────────────────────────────────────────

def _swing_points(df: pd.DataFrame, n: int = 3) -> tuple[pd.Series, pd.Series]:
    """Return boolean masks: True where a confirmed swing high/low occurs (n bars each side)."""
    h = df["high"].values
    l = df["low"].values
    size = len(h)
    sh = np.zeros(size, dtype=bool)
    sl = np.zeros(size, dtype=bool)
    for i in range(n, size - n):
        if all(h[i] >= h[i - k] for k in range(1, n + 1)) and all(h[i] >= h[i + k] for k in range(1, n + 1)):
            sh[i] = True
        if all(l[i] <= l[i - k] for k in range(1, n + 1)) and all(l[i] <= l[i + k] for k in range(1, n + 1)):
            sl[i] = True
    return pd.Series(sh, index=df.index), pd.Series(sl, index=df.index)


# ── Market structure (BOS / CHoCH) ────────────────────────────────────────────────

def _market_structure(
    df: pd.DataFrame, sh: pd.Series, sl: pd.Series, recent_bars: int = 60
) -> tuple[str, str, float | None, float | None, float | None, int | None]:
    n = len(df)
    sh_idx = np.where(sh.values)[0]
    sl_idx = np.where(sl.values)[0]

    if len(sh_idx) < 2 or len(sl_idx) < 2:
        return "RANGING", "NONE", None, None, None

    sh_vals = df["high"].values[sh_idx]
    sl_vals = df["low"].values[sl_idx]

    # Higher/Lower classifications on the last two confirmed swings of each type
    hh = bool(sh_vals[-1] > sh_vals[-2])   # Higher High
    lh = bool(sh_vals[-1] < sh_vals[-2])   # Lower High
    hl = bool(sl_vals[-1] > sl_vals[-2])   # Higher Low
    ll = bool(sl_vals[-1] < sl_vals[-2])   # Lower Low

    # Trend requires both legs to agree
    if hh and hl:
        trend = "BULLISH"
    elif lh and ll:
        trend = "BEARISH"
    else:
        trend = "RANGING"

    last_signal = "NONE"
    signal_price: float | None = None
    bos_level: float | None = None
    choch_level: float | None = None
    signal_bars_ago: int | None = None

    last_sh_bar = int(sh_idx[-1])
    last_sl_bar = int(sl_idx[-1])

    # Signal = most recent structural event; broken_level is the level price cleared,
    # not the new extreme (that's what gets drawn on the chart).
    if last_sh_bar > last_sl_bar:
        # Most recent confirmed swing is a HIGH
        if hh and last_sh_bar >= n - recent_bars:
            signal_bars_ago = n - 1 - last_sh_bar
            if ll:
                last_signal = "CHOCH_UP"
                choch_level = round(float(sh_vals[-2]), 2)
                signal_price = choch_level
            else:
                last_signal = "BOS_UP"
                bos_level = round(float(sh_vals[-2]), 2)
                signal_price = bos_level
    else:
        # Most recent confirmed swing is a LOW
        if ll and last_sl_bar >= n - recent_bars:
            signal_bars_ago = n - 1 - last_sl_bar
            if hh:
                last_signal = "CHOCH_DOWN"
                choch_level = round(float(sl_vals[-2]), 2)
                signal_price = choch_level
            else:
                last_signal = "BOS_DOWN"
                bos_level = round(float(sl_vals[-2]), 2)
                signal_price = bos_level

    return trend, last_signal, signal_price, bos_level, choch_level, signal_bars_ago


# ── Order Blocks ──────────────────────────────────────────────────────────────────

def _order_blocks(df: pd.DataFrame, lookback: int = 80) -> list[SmcZone]:
    zones: list[SmcZone] = []
    d = df.tail(lookback).copy()
    o_arr = d["open"].values
    h_arr = d["high"].values
    l_arr = d["low"].values
    c_arr = d["close"].values
    n = len(d)
    avg_body = float(np.mean(np.abs(c_arr - o_arr))) or 1.0
    times = [str(t) for t in d.index]

    for i in range(2, n - 3):
        body = c_arr[i] - o_arr[i]
        move = c_arr[i + 1] - o_arr[i + 1] if i + 1 < n else 0.0
        ob_h = float(max(o_arr[i], c_arr[i]))
        ob_l = float(min(o_arr[i], c_arr[i]))

        # Bullish OB: last bearish candle before an impulsive bullish move
        if body < 0 and move > avg_body * 1.25:
            future_lows = l_arr[i + 1:]
            invalidated = len(future_lows) > 0 and np.any(future_lows < ob_l)
            if not invalidated:
                touched = len(future_lows) > 0 and np.any(future_lows < ob_h)
                status = "TESTED" if touched else "ACTIVE"
                strength = min(95.0, 55.0 + abs(move) / avg_body * 14 + (5.0 if touched else 0.0))
                zones.append(SmcZone("BULL_OB", round(ob_h, 2), round(ob_l, 2), round(strength, 1), status, times[i]))

        # Bearish OB: last bullish candle before an impulsive bearish move
        if body > 0 and -move > avg_body * 1.25:
            future_highs = h_arr[i + 1:]
            invalidated = len(future_highs) > 0 and np.any(future_highs > ob_h)
            if not invalidated:
                touched = len(future_highs) > 0 and np.any(future_highs > ob_l)
                status = "TESTED" if touched else "ACTIVE"
                strength = min(95.0, 55.0 + abs(move) / avg_body * 14 + (5.0 if touched else 0.0))
                zones.append(SmcZone("BEAR_OB", round(ob_h, 2), round(ob_l, 2), round(strength, 1), status, times[i]))

    bull = sorted([z for z in zones if z.zone_type == "BULL_OB"], key=lambda z: -z.strength)[:4]
    bear = sorted([z for z in zones if z.zone_type == "BEAR_OB"], key=lambda z: -z.strength)[:3]
    return bull + bear


# ── Fair Value Gaps ───────────────────────────────────────────────────────────────

def _fvgs(df: pd.DataFrame, lookback: int = 100, min_gap_pct: float = 0.1) -> list[SmcZone]:
    """min_gap_pct: minimum gap as a % of average price (default 0.1% ≈ 24 pts on NIFTY)."""
    zones: list[SmcZone] = []
    d = df.tail(lookback)
    h_arr = d["high"].values
    l_arr = d["low"].values
    times = [str(t) for t in d.index]
    close_avg = float(d["close"].mean()) or 1.0
    min_gap = close_avg * min_gap_pct / 100.0
    n = len(d)
    cp = float(d["close"].iloc[-1])

    for i in range(2, n):
        # Bullish FVG: candle[i].low > candle[i-2].high (gap up)
        if l_arr[i] > h_arr[i - 2]:
            gap_h = float(l_arr[i])
            gap_l = float(h_arr[i - 2])
            if gap_h - gap_l >= min_gap:
                future_l = l_arr[i + 1:]  # strictly after the gap candle
                status = "FILLED" if (len(future_l) > 0 and np.any(future_l < gap_l)) else (
                    "PARTIAL" if (len(future_l) > 0 and np.any(future_l < gap_h)) else "UNFILLED"
                )
                if status != "FILLED":
                    zones.append(SmcZone("BULL_FVG", round(gap_h, 2), round(gap_l, 2), 65.0, status, times[i - 1]))

        # Bearish FVG: candle[i].high < candle[i-2].low (gap down)
        if h_arr[i] < l_arr[i - 2]:
            gap_h = float(l_arr[i - 2])
            gap_l = float(h_arr[i])
            if gap_h - gap_l >= min_gap:
                future_h = h_arr[i + 1:]  # strictly after the gap candle
                status = "FILLED" if (len(future_h) > 0 and np.any(future_h > gap_h)) else (
                    "PARTIAL" if (len(future_h) > 0 and np.any(future_h > gap_l)) else "UNFILLED"
                )
                if status != "FILLED":
                    zones.append(SmcZone("BEAR_FVG", round(gap_h, 2), round(gap_l, 2), 65.0, status, times[i - 1]))

    # Return the 8 FVGs closest to current price (most actionable)
    zones.sort(key=lambda z: abs((z.high + z.low) / 2.0 - cp))
    return zones[:8]


# ── Liquidity pools (equal highs/lows) ───────────────────────────────────────────

def _liquidity(df: pd.DataFrame, sh: pd.Series, sl: pd.Series) -> list[SmcZone]:
    zones: list[SmcZone] = []
    close_avg = float(df["close"].mean()) or 1.0
    current_price = float(df["close"].iloc[-1])
    tol = close_avg * 0.08 / 100.0

    h_vals = df["high"].values
    l_vals = df["low"].values
    sh_idx = np.where(sh.values)[0]
    sl_idx = np.where(sl.values)[0]
    sh_vals = h_vals[sh_idx]
    sl_vals = l_vals[sl_idx]

    seen_bsl: set[float] = set()
    for i in range(len(sh_vals)):
        for j in range(i + 1, min(i + 5, len(sh_vals))):
            if abs(sh_vals[i] - sh_vals[j]) < tol:
                lvl = round((sh_vals[i] + sh_vals[j]) / 2.0, 2)
                if lvl not in seen_bsl:
                    seen_bsl.add(lvl)
                    # Swept if any future candle high traded above the zone after both swings formed
                    later_bar = max(int(sh_idx[i]), int(sh_idx[j]))
                    future_h = h_vals[later_bar + 1:]
                    if len(future_h) == 0 or not np.any(future_h > lvl + tol):
                        time_str = str(df.index[later_bar])
                        zones.append(SmcZone("BSL", round(lvl + tol, 2), round(lvl - tol, 2), 58.0, "UNSWEPT", time_str))

    seen_ssl: set[float] = set()
    for i in range(len(sl_vals)):
        for j in range(i + 1, min(i + 5, len(sl_vals))):
            if abs(sl_vals[i] - sl_vals[j]) < tol:
                lvl = round((sl_vals[i] + sl_vals[j]) / 2.0, 2)
                if lvl not in seen_ssl:
                    seen_ssl.add(lvl)
                    later_bar = max(int(sl_idx[i]), int(sl_idx[j]))
                    future_l = l_vals[later_bar + 1:]
                    if len(future_l) == 0 or not np.any(future_l < lvl - tol):
                        time_str = str(df.index[later_bar])
                        zones.append(SmcZone("SSL", round(lvl + tol, 2), round(lvl - tol, 2), 58.0, "UNSWEPT", time_str))

    # Return 5 closest unswept levels to current price
    zones.sort(key=lambda z: abs((z.high + z.low) / 2.0 - current_price))
    return zones[:5]


# ── BSL / SSL sweep detection ─────────────────────────────────────────────────────

def _detect_sweep(
    df: pd.DataFrame, liq_zones: list[SmcZone], lookback: int = 25
) -> tuple[str, float | None, int | None]:
    """Fire SWEEP_DOWN when BSL is tagged then price closes back below, SWEEP_UP for SSL."""
    tail = df.tail(lookback)
    highs = tail["high"].values
    lows = tail["low"].values
    closes = tail["close"].values
    n = len(tail)

    best_signal = "NONE"
    best_price: float | None = None
    best_bars: int | None = None

    for z in liq_zones:
        mid = (z.high + z.low) / 2.0
        if z.zone_type == "BSL":
            for i in range(n - 1):
                if highs[i] >= z.low:   # price entered the BSL zone
                    # Reversal: any subsequent close back below zone mid within 5 bars
                    for j in range(i + 1, min(i + 6, n)):
                        if closes[j] < mid:
                            bars_ago = n - 1 - j
                            if bars_ago <= 15 and (best_bars is None or bars_ago < best_bars):
                                best_signal = "SWEEP_DOWN"
                                best_price = round(float(z.high), 2)
                                best_bars = bars_ago
                            break
        elif z.zone_type == "SSL":
            for i in range(n - 1):
                if lows[i] <= z.high:   # price entered the SSL zone
                    for j in range(i + 1, min(i + 6, n)):
                        if closes[j] > mid:
                            bars_ago = n - 1 - j
                            if bars_ago <= 15 and (best_bars is None or bars_ago < best_bars):
                                best_signal = "SWEEP_UP"
                                best_price = round(float(z.low), 2)
                                best_bars = bars_ago
                            break

    return best_signal, best_price, best_bars


# ── Main entry point ──────────────────────────────────────────────────────────────

def compute_smc(df: pd.DataFrame, swing_n: int = 3) -> SmcEngineResult:
    """Analyse a candle DataFrame with SMC methods. Returns SmcEngineResult."""
    if len(df) < 10:
        return SmcEngineResult("RANGING", "NONE", None, "EQUILIBRIUM", 50.0)

    sh, sl = _swing_points(df, swing_n)
    trend, last_signal, signal_price, bos_level, choch_level, signal_bars_ago = _market_structure(df, sh, sl)
    obs = _order_blocks(df)
    fvgs = _fvgs(df)
    liq = _liquidity(df, sh, sl)

    # ── Intraday fallback: multi-day RANGING → re-run on last 80 bars ─────────────
    if last_signal == "NONE" and len(df) > 30:
        intra_df = df.tail(80)
        i_sh, i_sl = _swing_points(intra_df, n=2)
        i_trend, i_sig, i_sp, i_bos, i_choch, i_bars = _market_structure(
            intra_df, i_sh, i_sl, recent_bars=40
        )
        if i_sig != "NONE":
            last_signal = i_sig
            signal_price = i_sp
            bos_level = i_bos
            choch_level = i_choch
            signal_bars_ago = i_bars
            if trend == "RANGING":
                trend = i_trend

    # ── BSL/SSL sweep fallback ─────────────────────────────────────────────────────
    if last_signal == "NONE":
        sw_sig, sw_price, sw_bars = _detect_sweep(df, liq)
        if sw_sig != "NONE":
            last_signal = sw_sig
            signal_price = sw_price
            bos_level = sw_price
            signal_bars_ago = sw_bars

    # Price zone: use ~1 day of candles (capped at 1/3 of dataset to be TF-aware)
    pd_window = max(30, min(len(df) // 3, 120))
    recent = df.tail(pd_window)
    rh = float(recent["high"].max())
    rl = float(recent["low"].min())
    cp = float(df["close"].iloc[-1])
    if rh > rl:
        pct = (cp - rl) / (rh - rl)
        price_zone = "PREMIUM" if pct > 0.65 else ("DISCOUNT" if pct < 0.35 else "EQUILIBRIUM")
    else:
        price_zone = "EQUILIBRIUM"

    # Confluence score: directionally symmetric
    score = 50.0
    score += 12.0 if trend == "BULLISH" else (-12.0 if trend == "BEARISH" else 0.0)

    if trend == "BULLISH":
        aligned_obs = [z for z in obs if z.zone_type == "BULL_OB"]
        aligned_fvgs = [z for z in fvgs if z.zone_type == "BULL_FVG"]
        if price_zone == "DISCOUNT":
            score += 8.0
    elif trend == "BEARISH":
        aligned_obs = [z for z in obs if z.zone_type == "BEAR_OB"]
        aligned_fvgs = [z for z in fvgs if z.zone_type == "BEAR_FVG"]
        if price_zone == "PREMIUM":
            score += 8.0
    else:
        aligned_obs = []
        aligned_fvgs = []

    score += min(18.0, len(aligned_obs) * 6.0)
    score += min(12.0, len(aligned_fvgs) * 4.0)
    score = max(15.0, min(92.0, score))

    return SmcEngineResult(
        trend=trend,
        last_signal=last_signal,
        signal_price=signal_price,
        price_zone=price_zone,
        confluence_score=round(score, 1),
        zones=obs + fvgs + liq,
        bos_level=bos_level,
        choch_level=choch_level,
        signal_bars_ago=signal_bars_ago,
    )
