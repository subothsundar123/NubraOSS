#!/usr/bin/env python3
"""
Bootstrap IV history from Yahoo Finance data.

Sources
-------
NIFTY     — ^INDIAVIX  (NSE India VIX, the official 30-day ATM IV for NIFTY 50)
Others    — 30-day realised vol from index prices (^NSEBANK, NIFTY_FIN_SERVICE.NS, etc.)
            scaled by ×1.15 IV/HV ratio typical for Indian indices.

Usage
-----
  # From backend/ directory:
  .venv/bin/python scripts/bootstrap_iv_history.py              # NIFTY only
  .venv/bin/python scripts/bootstrap_iv_history.py --underlying BANKNIFTY
  .venv/bin/python scripts/bootstrap_iv_history.py --underlying ALL
  .venv/bin/python scripts/bootstrap_iv_history.py --force      # re-download + overwrite
"""
from __future__ import annotations

import argparse
import json
import logging
import math
import sqlite3
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

import subprocess

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
DB_PATH = Path(__file__).resolve().parents[1] / "data" / "nubraoss.sqlite3"
ENVIRONMENT = "PROD"
MIN_ROWS_TO_SKIP = 50   # skip if underlying already has this many rows
IV_HV_SCALE = 1.15      # typical implied/realised vol ratio for Indian indices
HV_WINDOW = 30          # 30-day realised vol window

YF_BASE = "https://query1.finance.yahoo.com/v8/finance/chart/{sym}?interval=1d&range=2y"
_UA = "Mozilla/5.0"

# Underlying → Yahoo Finance ticker (^ pre-encoded as %5E for curl compatibility).
# NIFTY uses VIX directly; others use index price → rolling HV.
YF_TICKERS: dict[str, str] = {
    "NIFTY":      "%5EINDIAVIX",            # India VIX — direct IV, no HV scaling
    "BANKNIFTY":  "%5ENSEBANK",
    "FINNIFTY":   "NIFTY_FIN_SERVICE.NS",
    "MIDCPNIFTY": "NIFTYMIDCAP150.NS",
    "SENSEX":     "%5EBSESN",
}


# ── HTTP ──────────────────────────────────────────────────────────────────────
def _fetch_yahoo(symbol: str) -> Optional[dict]:
    """Use curl via subprocess — more reliable than httpx for Yahoo Finance."""
    import time
    url = YF_BASE.format(sym=symbol)
    cmd = [
        "curl", "-s", "--compressed", "--max-time", "30",
        "-H", f"User-Agent: {_UA}",
        "-H", "Accept: application/json",
        "-H", "Accept-Language: en-US,en;q=0.9",
        url,
    ]
    for attempt in range(4):
        if attempt > 0:
            wait = 15 * attempt
            log.info("  Waiting %ds before retry %d/3…", wait, attempt)
            time.sleep(wait)
        try:
            result = subprocess.run(cmd, capture_output=True, timeout=35, check=False)
            body = result.stdout.strip()
            if not body or b"Too Many Requests" in body or b"rate limit" in body.lower():
                log.warning("  Rate-limited by Yahoo Finance (attempt %d)", attempt + 1)
                continue
            return json.loads(body)
        except (json.JSONDecodeError, OSError) as e:
            log.warning("  Parse error attempt %d: %s", attempt + 1, e)
    log.error("Yahoo Finance: gave up after retries for %s", symbol)
    return None


def _parse_yahoo_series(raw: dict) -> list[tuple[date, float]]:
    """Extract (date, close) pairs from Yahoo Finance v8 chart response."""
    try:
        result = raw["chart"]["result"][0]
        timestamps = result["timestamp"]
        closes = result["indicators"]["quote"][0]["close"]
    except (KeyError, IndexError, TypeError):
        return []

    pairs: list[tuple[date, float]] = []
    for ts, close in zip(timestamps, closes):
        if close is None:
            continue
        d = datetime.utcfromtimestamp(ts).date()
        pairs.append((d, float(close)))

    pairs.sort(key=lambda x: x[0])
    return pairs


# ── IV computation helpers ─────────────────────────────────────────────────────
def _price_to_hv_series(price_series: list[tuple[date, float]], window: int = HV_WINDOW) -> list[tuple[date, float]]:
    """
    Convert price series to annualised 30-day realised volatility series.
    Returns (date, rv_pct) pairs for dates where a full `window` of returns exist.
    """
    if len(price_series) < window + 1:
        return []

    log_returns = []
    for i in range(1, len(price_series)):
        p0, p1 = price_series[i - 1][1], price_series[i][1]
        if p0 > 0 and p1 > 0:
            log_returns.append((price_series[i][0], math.log(p1 / p0)))
        else:
            log_returns.append((price_series[i][0], 0.0))

    rv_series: list[tuple[date, float]] = []
    for i in range(window, len(log_returns)):
        window_returns = [r for _, r in log_returns[i - window: i]]
        mean_r = sum(window_returns) / window
        variance = sum((r - mean_r) ** 2 for r in window_returns) / (window - 1)
        daily_vol = math.sqrt(variance)
        annual_vol_pct = daily_vol * math.sqrt(252) * 100
        rv_series.append((log_returns[i][0], round(annual_vol_pct, 2)))

    return rv_series


# ── IV Rank / Percentile ──────────────────────────────────────────────────────
def _rank_pct(history: list[float], current: float) -> tuple[float, float]:
    if len(history) < 2:
        return 50.0, 50.0
    iv_low, iv_high = min(history), max(history)
    rank = round((current - iv_low) / (iv_high - iv_low) * 100, 1) if iv_high > iv_low else 50.0
    pct = round(sum(1 for v in history if v < current) / len(history) * 100, 1)
    return rank, pct


def _build_records(underlying: str, iv_series: list[tuple[date, float]]) -> list[dict]:
    records = []
    for i, (d, iv) in enumerate(iv_series):
        rank, pct = _rank_pct([v for _, v in iv_series[:i]], iv)
        records.append({
            "underlying": underlying,
            "expiry": "",
            "environment": ENVIRONMENT,
            "recorded_at": d.isoformat() + "T09:30:00+00:00",
            "atm_iv": iv,
            "atm_strike": None,
            "iv_rank": rank,
            "iv_percentile": pct,
        })
    return records


# ── Database ──────────────────────────────────────────────────────────────────
def _count(conn: sqlite3.Connection, underlying: str) -> int:
    return conn.execute(
        "SELECT COUNT(*) FROM oie_iv_history WHERE underlying=? AND environment=?",
        (underlying, ENVIRONMENT),
    ).fetchone()[0]


def _upsert(conn: sqlite3.Connection, underlying: str, records: list[dict], force: bool) -> None:
    if force:
        conn.execute(
            "DELETE FROM oie_iv_history WHERE underlying=? AND environment=?",
            (underlying, ENVIRONMENT),
        )
        conn.commit()

    conn.executemany(
        """
        INSERT INTO oie_iv_history
            (underlying, expiry, environment, recorded_at, atm_iv, atm_strike,
             iv_rank, iv_percentile, payload_json)
        SELECT :underlying, :expiry, :environment, :recorded_at, :atm_iv, :atm_strike,
               :iv_rank, :iv_percentile, '{}'
        WHERE NOT EXISTS (
            SELECT 1 FROM oie_iv_history
            WHERE underlying = :underlying
              AND environment = :environment
              AND recorded_at = :recorded_at
        )
        """,
        records,
    )
    conn.commit()
    log.info("  %s: %d rows now in oie_iv_history", underlying, _count(conn, underlying))


# ── Per-underlying bootstrap ──────────────────────────────────────────────────
def bootstrap_underlying(conn: sqlite3.Connection, underlying: str, force: bool) -> bool:
    existing = _count(conn, underlying)
    if not force and existing >= MIN_ROWS_TO_SKIP:
        log.info("%s: %d rows already present — skipping (--force to re-run)", underlying, existing)
        return True

    ticker = YF_TICKERS.get(underlying)
    if ticker is None:
        log.error("%s: no Yahoo Finance ticker configured — skipping", underlying)
        return False

    log.info("%s: downloading from Yahoo Finance (%s)…", underlying, ticker.replace("%5E", "^"))
    raw = _fetch_yahoo(ticker)
    if raw is None:
        return False

    price_series = _parse_yahoo_series(raw)
    if not price_series:
        log.error("%s: empty price series from Yahoo Finance", underlying)
        return False

    if underlying == "NIFTY":
        # VIX values are already IV in % (e.g. 12.5 = 12.5%)
        iv_series = price_series
        log.info("  %d VIX daily readings", len(iv_series))
    else:
        # Convert price → 30-day realised vol, then scale to implied vol
        rv_series = _price_to_hv_series(price_series)
        if not rv_series:
            log.error("%s: insufficient price history for vol computation", underlying)
            return False
        iv_series = [(d, round(rv * IV_HV_SCALE, 2)) for d, rv in rv_series]
        log.info("  %d days of price data → %d HV readings (×%.2f IV/HV scale)", len(price_series), len(iv_series), IV_HV_SCALE)

    records = _build_records(underlying, iv_series)
    _upsert(conn, underlying, records, force)
    return True


# ── CLI ───────────────────────────────────────────────────────────────────────
SUPPORTED = list(YF_TICKERS.keys())


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed oie_iv_history with 2yr of IV data for IV Rank/Percentile metrics.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--underlying",
        default="NIFTY",
        choices=SUPPORTED + ["ALL"],
        help="Which underlying to bootstrap (default: NIFTY)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Delete existing rows and re-download",
    )
    args = parser.parse_args()

    if not DB_PATH.exists():
        log.error("Database not found at %s", DB_PATH)
        log.error("Start the backend once to create the schema, then re-run.")
        sys.exit(1)

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row

    targets = SUPPORTED if args.underlying == "ALL" else [args.underlying]
    failed: list[str] = []

    for underlying in targets:
        log.info("── %s ─────────────────────────────────", underlying)
        ok = bootstrap_underlying(conn, underlying, force=args.force)
        if not ok:
            failed.append(underlying)

    conn.close()

    if failed:
        log.warning("Failed underlyings: %s", ", ".join(failed))
        sys.exit(1)
    else:
        log.info("Bootstrap complete.")


if __name__ == "__main__":
    main()
