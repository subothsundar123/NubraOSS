"""
Backtest Engine — replays historical OIE chain snapshots and evaluates
strategy conditions on each snapshot to simulate signal-based trading.

Data source: oie_chain_snapshots table (written on every /api/oie/chain call).
P&L model: enter on signal open, exit at next snapshot or after time_stop_minutes.
Position sizing via lot_size from the snapshot or 1 if unavailable.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

UTC = timezone.utc


@dataclass
class BacktestTrade:
    date: str
    signal: str             # "BUY" | "SELL" | "NONE"
    entry: float
    exit: float
    pnl: float
    duration_min: int
    reason: str             # exit reason


@dataclass
class BacktestResult:
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    total_pnl: float = 0.0
    max_drawdown: float = 0.0
    win_rate: float = 0.0
    avg_win: float = 0.0
    avg_loss: float = 0.0
    profit_factor: float = 0.0
    sharpe_ratio: float = 0.0
    trades: list[BacktestTrade] = field(default_factory=list)


def _load_snapshots(
    underlying: str,
    environment: str,
    from_date: str,
    to_date: str,
) -> list[dict[str, Any]]:
    try:
        from app.db import get_db_connection
        with get_db_connection() as conn:
            rows = conn.execute(
                """select id, underlying, expiry, created_at, spot_price,
                          total_gex, gamma_flip_level, pcr, max_pain, gex_bias, payload_json
                   from oie_chain_snapshots
                   where underlying=? and environment=?
                         and date(created_at) between date(?) and date(?)
                   order by created_at asc""",
                (underlying.upper(), environment, from_date, to_date),
            ).fetchall()

        cols = ["id", "underlying", "expiry", "created_at", "spot_price",
                "total_gex", "gamma_flip_level", "pcr", "max_pain", "gex_bias", "payload_json"]
        results = []
        for row in rows:
            d = dict(zip(cols, row))
            try:
                payload = json.loads(d.pop("payload_json") or "{}")
                d.update(payload)
            except Exception:
                pass
            results.append(d)
        return results
    except Exception:
        return []


def _classify_signal(snap: dict[str, Any]) -> str:
    """
    Classify each snapshot as BUY / SELL / NONE based on key metrics.
    This mirrors the intelligence engine scoring but simpler for replay.
    """
    bull = 0
    bear = 0

    pcr = snap.get("pcr")
    if pcr is not None:
        if pcr > 1.1:
            bear += 15
        elif pcr < 0.85:
            bull += 15

    gex = snap.get("total_gex")
    if gex is not None:
        if gex > 0:
            bull += 8
        else:
            bear += 5

    gflip = snap.get("gamma_flip_level")
    spot = snap.get("spot_price")
    if spot and gflip:
        if spot > gflip:
            bull += 6
        else:
            bear += 7

    gex_bias = snap.get("gex_bias", "")
    if gex_bias == "Positive":
        bull += 5
    elif gex_bias == "Negative":
        bear += 5

    # Require at least 60% dominance
    total = bull + bear
    if total == 0:
        return "NONE"
    if bull / total > 0.6:
        return "BUY"
    if bear / total > 0.6:
        return "SELL"
    return "NONE"


def _pnl_for_trade(
    entry_spot: float,
    exit_spot: float,
    signal: str,
    lots: int,
    lot_size: int,
) -> float:
    """Simple spot-based P&L (index point value ₹1 per lot_size units)."""
    point_value = lot_size  # e.g., NIFTY lot = 25 → ₹25 per point
    pts = exit_spot - entry_spot
    if signal == "SELL":
        pts = -pts
    return round(pts * lots * point_value, 2)


def run_backtest(
    underlying: str,
    environment: str,
    from_date: str,
    to_date: str,
    position_size_lots: int = 1,
    stop_loss_pct: float = 25.0,
    target_pct: float = 50.0,
    time_stop_minutes: int = 60,
    strategy_id: str | None = None,
) -> BacktestResult:
    result = BacktestResult()
    snapshots = _load_snapshots(underlying, environment, from_date, to_date)

    if len(snapshots) < 2:
        return result

    # Infer lot size from snapshot payload or use defaults
    LOT_SIZES = {"NIFTY": 25, "BANKNIFTY": 15, "FINNIFTY": 40, "MIDCPNIFTY": 75, "SENSEX": 20}
    lot_size = LOT_SIZES.get(underlying.upper(), 25)

    trades: list[BacktestTrade] = []
    in_trade = False
    entry_signal = "NONE"
    entry_spot = 0.0
    entry_dt = ""

    for i, snap in enumerate(snapshots):
        spot = snap.get("spot_price")
        if not spot:
            continue

        signal = _classify_signal(snap)

        if not in_trade:
            if signal in ("BUY", "SELL"):
                in_trade = True
                entry_signal = signal
                entry_spot = spot
                entry_dt = snap.get("created_at", "")
            continue

        # We're in a trade — check exit conditions
        pnl_pts = (spot - entry_spot) if entry_signal == "BUY" else (entry_spot - spot)
        pnl_pct = pnl_pts / entry_spot * 100

        exit_reason = ""
        if pnl_pct <= -stop_loss_pct / 100 * entry_spot / entry_spot * 100:
            # Stop loss: pnl_pct < -stop_loss_pct (stop_loss_pct is % of option premium roughly)
            # Simplified: treat as spot % drawdown
            if pnl_pts / entry_spot * 100 <= -stop_loss_pct * 0.1:
                exit_reason = "Stop Loss"

        if not exit_reason and pnl_pts / entry_spot * 100 >= target_pct * 0.1:
            exit_reason = "Target"

        # Time stop
        if not exit_reason and entry_dt:
            try:
                entry_time = datetime.fromisoformat(entry_dt.replace("Z", "+00:00"))
                snap_time = datetime.fromisoformat(
                    snap.get("created_at", "").replace("Z", "+00:00")
                )
                elapsed = (snap_time - entry_time).total_seconds() / 60
                if elapsed >= time_stop_minutes:
                    exit_reason = "Time Stop"
            except Exception:
                pass

        # Signal flip
        if not exit_reason and signal not in (entry_signal, "NONE"):
            exit_reason = "Signal Flip"

        # End of data
        if not exit_reason and i == len(snapshots) - 1:
            exit_reason = "End of Period"

        if exit_reason:
            pnl = _pnl_for_trade(entry_spot, spot, entry_signal, position_size_lots, lot_size)

            # Calc duration
            duration = 0
            if entry_dt:
                try:
                    et = datetime.fromisoformat(entry_dt.replace("Z", "+00:00"))
                    xt = datetime.fromisoformat(
                        snap.get("created_at", "").replace("Z", "+00:00")
                    )
                    duration = max(1, int((xt - et).total_seconds() / 60))
                except Exception:
                    duration = 1

            trades.append(BacktestTrade(
                date=entry_dt[:10],
                signal=entry_signal,
                entry=round(entry_spot, 2),
                exit=round(spot, 2),
                pnl=pnl,
                duration_min=duration,
                reason=exit_reason,
            ))
            in_trade = False
            entry_signal = "NONE"

    # ── Compute statistics ────────────────────────────────────────────────────
    if not trades:
        return result

    wins = [t for t in trades if t.pnl > 0]
    losses = [t for t in trades if t.pnl <= 0]
    pnls = [t.pnl for t in trades]

    total_win = sum(t.pnl for t in wins)
    total_loss = abs(sum(t.pnl for t in losses))
    avg_win = total_win / len(wins) if wins else 0.0
    avg_loss = total_loss / len(losses) if losses else 0.0
    profit_factor = total_win / total_loss if total_loss > 0 else (999.0 if total_win > 0 else 0.0)

    # Max drawdown
    cumulative = 0.0
    peak = 0.0
    max_dd = 0.0
    for p in pnls:
        cumulative += p
        if cumulative > peak:
            peak = cumulative
        dd = peak - cumulative
        if dd > max_dd:
            max_dd = dd

    # Sharpe (simplified: mean pnl / std pnl)
    import statistics
    sharpe = 0.0
    if len(pnls) > 1:
        mean = statistics.mean(pnls)
        std = statistics.stdev(pnls)
        sharpe = round(mean / std * (252 ** 0.5), 2) if std > 0 else 0.0

    result.total_trades = len(trades)
    result.winning_trades = len(wins)
    result.losing_trades = len(losses)
    result.total_pnl = round(sum(pnls), 2)
    result.max_drawdown = round(-max_dd, 2)
    result.win_rate = round(len(wins) / len(trades) * 100, 1)
    result.avg_win = round(avg_win, 2)
    result.avg_loss = round(avg_loss, 2)
    result.profit_factor = round(profit_factor, 2)
    result.sharpe_ratio = sharpe
    result.trades = trades[-100:]  # cap at 100 rows for payload size

    return result
