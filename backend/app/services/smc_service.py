"""SMC service — fetches candles and runs the SMC engine."""
from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta

import pandas as pd
from fastapi import HTTPException

from app.services.market_history_service import HistoricalFetchRequest, market_history_service
from app.services.smc_engine import SmcEngineResult, SmcZone, compute_smc

log = logging.getLogger(__name__)

# ── Interval configuration ────────────────────────────────────────────────────────

_INTERVAL_CFG: dict[str, dict] = {
    # intraday=False: Nubra API returns only today when intraDay=True, even for
    # intraday intervals. False gives multi-day history with minute resolution.
    # max_candles: NSE session = 375 min/day.
    # swing_n: bars each side for swing detection — higher = fewer but more reliable swings.
    "1":   {"label": "1m",  "lookback_days": 5,  "intraday": False, "max_candles": 750,  "swing_n": 4},
    "3":   {"label": "3m",  "lookback_days": 5,  "intraday": False, "max_candles": 500,  "swing_n": 3},
    "5":   {"label": "5m",  "lookback_days": 7,  "intraday": False, "max_candles": 600,  "swing_n": 3},
    "15":  {"label": "15m", "lookback_days": 15, "intraday": False, "max_candles": 375,  "swing_n": 3},
    "60":  {"label": "1h",  "lookback_days": 45, "intraday": False, "max_candles": 280,  "swing_n": 3},
}

_MTF_MAP: dict[str, list[str]] = {
    "1":   ["5", "15", "60"],
    "3":   ["5", "15", "60"],
    "5":   ["15", "60"],
    "15":  ["60"],
    "60":  [],
}

_SIGNAL_LABELS: dict[str, str] = {
    "BOS_UP":      "BOS ↑",
    "BOS_DOWN":    "BOS ↓",
    "CHOCH_UP":    "CHoCH ↑",
    "CHOCH_DOWN":  "CHoCH ↓",
    "SWEEP_UP":    "Sweep ↑",
    "SWEEP_DOWN":  "Sweep ↓",
    "NONE":        "—",
}

_CACHE_TTL = 20.0
_cache: dict[str, tuple[float, dict]] = {}


def _cache_key(env: str, exchange: str, symbol: str, interval: str) -> str:
    return f"{env}:{exchange}:{symbol}:{interval}"


def _fetch_df(
    *,
    session_token: str,
    device_id: str,
    environment: str,
    exchange: str,
    symbol: str,
    interval: str,
) -> pd.DataFrame | None:
    cfg = _INTERVAL_CFG.get(interval)
    if cfg is None:
        return None
    now = datetime.now()
    start = now - timedelta(days=cfg["lookback_days"] + 1)
    try:
        frames = market_history_service.fetch(
            HistoricalFetchRequest(
                session_token=session_token,
                device_id=device_id,
                environment=environment,
                symbols=(symbol.upper(),),
                exchange=exchange,
                instrument_type="INDEX" if symbol.upper() in ("NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "SENSEX") else "STOCK",
                interval=cfg["label"],
                start_dt=start,
                end_dt=now,
                intra_day=cfg["intraday"],
            )
        )
    except HTTPException:
        raise
    except Exception as exc:
        log.warning("smc_service fetch error symbol=%s interval=%s: %s", symbol, interval, exc)
        return None
    return frames.get(symbol.upper())


def _build_zone_dict(z: SmcZone) -> dict:
    return {
        "zone_type": z.zone_type,
        "high": z.high,
        "low": z.low,
        "strength": z.strength,
        "status": z.status,
        "candle_time": z.candle_time,
    }


def _build_mtf_level(interval: str, result: SmcEngineResult) -> dict:
    label = _INTERVAL_CFG.get(interval, {}).get("label", interval)
    sig_label = _SIGNAL_LABELS.get(result.last_signal, result.last_signal)

    notes_map: dict[str, str] = {
        "BOS_UP":     "Structure break up",
        "BOS_DOWN":   "Structure break down",
        "CHOCH_UP":   "Potential reversal up",
        "CHOCH_DOWN": "Potential reversal down",
        "SWEEP_UP":   "Liquidity swept — bullish reversal",
        "SWEEP_DOWN": "Liquidity swept — bearish reversal",
        "NONE":       "No recent signal",
    }
    return {
        "timeframe": label,
        "interval": interval,
        "trend": result.trend,
        "last_signal": result.last_signal,
        "signal_label": sig_label,
        "price_zone": result.price_zone,
        "note": notes_map.get(result.last_signal, ""),
        "confluence_score": result.confluence_score,
        "bos_level": result.bos_level,
    }


def _candle_rows(df: pd.DataFrame, max_candles: int = 600) -> list[dict]:
    tail = df.tail(max_candles)
    rows = []
    for ts, row in tail.iterrows():
        rows.append({
            "t": str(ts),
            "o": round(float(row["open"]), 2),
            "h": round(float(row["high"]), 2),
            "l": round(float(row["low"]), 2),
            "c": round(float(row["close"]), 2),
            "v": round(float(row.get("bucket_volume", 0)), 0),
        })
    return rows


class SmcService:
    def snapshot(self, *, session_token: str, device_id: str, environment: str, exchange: str, symbol: str, interval: str) -> dict:
        ck = _cache_key(environment, exchange, symbol, interval)
        now = time.monotonic()
        cached = _cache.get(ck)
        if cached and now < cached[0]:
            return cached[1]

        df = _fetch_df(
            session_token=session_token, device_id=device_id, environment=environment,
            exchange=exchange, symbol=symbol, interval=interval,
        )
        if df is None or df.empty:
            raise HTTPException(status_code=404, detail=f"No candle data for {symbol} ({interval})")

        cfg = _INTERVAL_CFG.get(interval, {})
        primary = compute_smc(df, swing_n=cfg.get("swing_n", 3))

        # MTF: fetch additional intervals concurrently
        mtf_intervals = _MTF_MAP.get(interval, [])
        mtf_results: dict[str, SmcEngineResult] = {}
        mtf_last_ts: dict[str, str] = {}  # last candle time per MTF interval

        def _fetch_and_compute(iv: str) -> tuple[str, SmcEngineResult | None, str]:
            try:
                sub_df = _fetch_df(
                    session_token=session_token, device_id=device_id, environment=environment,
                    exchange=exchange, symbol=symbol, interval=iv,
                )
                if sub_df is not None and not sub_df.empty:
                    iv_cfg = _INTERVAL_CFG.get(iv, {})
                    return iv, compute_smc(sub_df, swing_n=iv_cfg.get("swing_n", 3)), str(sub_df.index[-1])
            except Exception as exc:
                log.debug("MTF fetch failed %s %s: %s", symbol, iv, exc)
            return iv, None, ""

        if mtf_intervals:
            with ThreadPoolExecutor(max_workers=3) as pool:
                futures = {pool.submit(_fetch_and_compute, iv): iv for iv in mtf_intervals}
                for fut in as_completed(futures):
                    iv, res, last_ts = fut.result()
                    if res is not None:
                        mtf_results[iv] = res
                        mtf_last_ts[iv] = last_ts

        # MTF list ordered from higher TF down to primary
        mtf_list = []
        for iv in reversed(mtf_intervals):
            if iv in mtf_results:
                mtf_list.append(_build_mtf_level(iv, mtf_results[iv]))
        # Add primary interval last
        mtf_list.append(_build_mtf_level(interval, primary))

        # Recent signals from primary + MTF
        recent_signals = []
        if primary.last_signal != "NONE" and primary.signal_price:
            recent_signals.append({
                "symbol": symbol,
                "signal": primary.last_signal,
                "signal_label": _SIGNAL_LABELS.get(primary.last_signal, primary.last_signal),
                "timeframe": _INTERVAL_CFG.get(interval, {}).get("label", interval),
                "price": primary.signal_price,
                "strength": primary.confluence_score,
                "timestamp": str(df.index[-1]),
            })
        for iv, res in mtf_results.items():
            if res.last_signal != "NONE" and res.signal_price:
                recent_signals.append({
                    "symbol": symbol,
                    "signal": res.last_signal,
                    "signal_label": _SIGNAL_LABELS.get(res.last_signal, res.last_signal),
                    "timeframe": _INTERVAL_CFG.get(iv, {}).get("label", iv),
                    "price": res.signal_price,
                    "strength": res.confluence_score,
                    "timestamp": mtf_last_ts.get(iv, str(df.index[-1])),
                })

        current_price = float(df["close"].iloc[-1])

        response = {
            "status": "success",
            "symbol": symbol.upper(),
            "exchange": exchange,
            "interval": interval,
            "interval_label": _INTERVAL_CFG.get(interval, {}).get("label", interval),
            "current_price": round(current_price, 2),
            "structure_trend": primary.trend,
            "confluence_score": primary.confluence_score,
            "price_zone": primary.price_zone,
            "bos_level": primary.bos_level,
            "choch_level": primary.choch_level,
            "last_signal": primary.last_signal,
            "last_signal_label": _SIGNAL_LABELS.get(primary.last_signal, primary.last_signal),
            "signal_bars_ago": primary.signal_bars_ago,
            "zones": [_build_zone_dict(z) for z in primary.zones],
            "mtf": mtf_list,
            "recent_signals": recent_signals,
            "candles": _candle_rows(df, _INTERVAL_CFG.get(interval, {}).get("max_candles", 600)),
            "fetched_at": datetime.now().isoformat(),
        }

        _cache[ck] = (now + _CACHE_TTL, response)
        return response

    def scan(self, *, session_token: str, device_id: str, environment: str, exchange: str, symbols: list[str], interval: str) -> dict:
        results = []

        def _scan_one(sym: str) -> dict | None:
            try:
                snap = self.snapshot(
                    session_token=session_token, device_id=device_id, environment=environment,
                    exchange=exchange, symbol=sym, interval=interval,
                )
                for sig in snap.get("recent_signals", []):
                    results.append(sig)
                return None
            except Exception:
                return None

        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(_scan_one, symbols))

        results.sort(key=lambda r: -r.get("strength", 0))
        return {"status": "success", "signals": results}


smc_service = SmcService()
