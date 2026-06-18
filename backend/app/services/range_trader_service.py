from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

import httpx
import pandas as pd
from fastapi import HTTPException

from app.config import settings
from app.db import (
    append_range_trader_event,
    connect_db,
    load_range_trader_setup,
    load_range_trader_events,
    load_range_trader_setups,
    update_range_trader_setup_payload,
    update_range_trader_setup_status,
    upsert_range_trader_setup,
)
from app.schemas import (
    RangeTraderCandle,
    RangeTraderChartRequest,
    RangeTraderChartResponse,
    RangeTraderControlRequest,
    RangeTraderEvent,
    RangeTraderEventsResponse,
    RangeTraderInstrument,
    RangeTraderInstrumentSearchRequest,
    RangeTraderInstrumentSearchResponse,
    RangeTraderKillRequest,
    RangeTraderOptionResolveRequest,
    RangeTraderOptionResolveResponse,
    RangeTraderSetup,
    RangeTraderSetupListRequest,
    RangeTraderSetupListResponse,
    RangeTraderSetupResponse,
    RangeTraderSetupUpsertRequest,
    SessionStatusRequest,
)
from app.services.auth_service import auth_service
from app.services.instrument_service import instrument_service
from app.services.market_history_service import HistoricalFetchRequest, market_history_service
from app.services.range_trader_order_utils import normalize_ltp_price, normalize_order_result

IST = ZoneInfo("Asia/Kolkata")
_log = logging.getLogger(__name__)


class RangeTraderService:
    def search_instruments(self, request: RangeTraderInstrumentSearchRequest) -> RangeTraderInstrumentSearchResponse:
        rows = instrument_service.search_tradable(
            session_token=request.session_token,
            environment=request.environment,
            device_id=request.device_id,
            query=request.query,
            limit=request.limit,
        )
        return RangeTraderInstrumentSearchResponse(items=[RangeTraderInstrument(**row) for row in rows])

    def resolve_option(self, request: RangeTraderOptionResolveRequest) -> RangeTraderOptionResolveResponse:
        ref_id, lot_size, tick_size, display_name, exchange = instrument_service.resolve_option_meta(
            session_token=request.session_token,
            environment=request.environment,
            device_id=request.device_id,
            underlying=request.underlying,
            strike_price=request.strike_price,
            option_type=request.option_type,
            expiry_hint=request.expiry,
            ref_id_hint=request.ref_id,
        )
        instrument = RangeTraderInstrument(
            symbol=display_name.strip().upper(),
            display_name=display_name.strip().upper(),
            exchange=exchange,
            instrument_type="OPT",
            derivative_type="OPT",
            option_type=request.option_type,
            expiry=request.expiry,
            strike_price=request.strike_price,
            chart_symbol=display_name.strip().upper(),
            ltp_hint=request.ltp_hint,
            ref_id=ref_id,
            tick_size=tick_size,
            lot_size=lot_size,
        )
        return RangeTraderOptionResolveResponse(status="success", instrument=instrument)

    def chart(self, request: RangeTraderChartRequest) -> RangeTraderChartResponse:
        now = datetime.now(IST)
        start_week = now - timedelta(days=request.lookback_days)
        symbol = request.symbol.strip().upper()
        candidate_symbols = self._chart_symbol_candidates(request)
        candidate_types = self._chart_type_candidates(request.instrument_type)
        is_option_chart = request.instrument_type.strip().upper() in {"OPT", "OPTION", "OPTIONS"}
        intraday_start = now.replace(hour=9, minute=15, second=0, microsecond=0)
        fetch_windows = (
            ((True, start_week), (False, start_week), (True, intraday_start))
            if is_option_chart
            else ((True, intraday_start), (False, start_week))
        )

        frames: dict[str, pd.DataFrame] = {}
        last_error: HTTPException | None = None
        for chart_type in candidate_types:
            for chart_symbol in candidate_symbols:
                for intra_day, start_dt in fetch_windows:
                    try:
                        fetched = market_history_service.fetch(
                            HistoricalFetchRequest(
                                session_token=request.session_token,
                                device_id=request.device_id,
                                environment=request.environment,
                                symbols=(chart_symbol,),
                                exchange=request.exchange,
                                instrument_type=chart_type,
                                interval=request.timeframe,
                                start_dt=start_dt,
                                end_dt=now,
                                intra_day=intra_day,
                            )
                        )
                        frames.update(fetched)
                    except HTTPException as exc:
                        last_error = exc
                    except Exception as exc:
                        if not frames:
                            raise HTTPException(status_code=502, detail=f"Unable to load range chart data: {exc}") from exc

                frame = frames.get(chart_symbol)
                if frame is None:
                    frame = frames.get(chart_symbol.upper())
                if frame is not None and not frame.empty and (not is_option_chart or self._option_frame_looks_sane(frame, request.ltp_hint)):
                    break
            if (not is_option_chart and frames) or any(
                not item.empty and self._option_frame_looks_sane(item, request.ltp_hint)
                for item in frames.values()
            ):
                break

        if not frames and last_error is not None and last_error.status_code not in {400, 404}:
            raise last_error
        frame = None
        for chart_symbol in candidate_symbols:
            frame = frames.get(chart_symbol)
            if frame is None:
                frame = frames.get(chart_symbol.upper())
            if frame is not None and not frame.empty and (not is_option_chart or self._option_frame_looks_sane(frame, request.ltp_hint)):
                symbol = chart_symbol
                break
        if frame is None and frames and not is_option_chart:
            frame = next(iter(frames.values()))
        if frame is None or frame.empty:
            if is_option_chart and request.ref_id is not None:
                _log.warning(
                    "range_trader_option_chart_fallback symbol=%s display=%s ref_id=%s exchange=%s type=%s timeframe=%s candidates=%s",
                    request.symbol,
                    request.display_name,
                    request.ref_id,
                    request.exchange,
                    request.instrument_type,
                    request.timeframe,
                    candidate_symbols[:8],
                )
                try:
                    return self._synthetic_option_quote_chart(
                        request,
                        reason="Intraday option candles were unavailable; using live option quote as a starter chart.",
                    )
                except Exception:
                    pass
            tried_symbols = ", ".join(candidate_symbols[:6])
            tried_types = ", ".join(candidate_types)
            raise HTTPException(status_code=404, detail=f"No chart candles found. Tried symbols [{tried_symbols}] with types [{tried_types}].")

        frame = frame.sort_index()
        frame = frame[~frame.index.duplicated(keep="last")]
        candles = [
            RangeTraderCandle(
                epoch_ms=int(ts.timestamp() * 1000),
                open=float(row["open"]),
                high=float(row["high"]),
                low=float(row["low"]),
                close=float(row["close"]),
                volume=float(row["bucket_volume"]) if pd.notna(row.get("bucket_volume")) else None,
            )
            for ts, row in frame.iterrows()
        ]
        last_price = candles[-1].close if candles else None
        return RangeTraderChartResponse(
            status="success",
            instrument=RangeTraderInstrument(
                symbol=symbol,
                display_name=request.display_name or symbol,
                exchange=request.exchange,
                instrument_type=request.instrument_type.strip().upper(),
                chart_symbol=symbol,
                ref_id=1,
                tick_size=1,
                lot_size=1,
            ),
            timeframe=request.timeframe,
            last_price=last_price,
            candles=candles[-1500:],
        )

    def _option_frame_looks_sane(self, frame: pd.DataFrame, ltp_hint: float | None = None) -> bool:
        if frame.empty:
            return False
        close = frame["close"].dropna()
        if close.empty:
            return False
        latest_close = float(close.iloc[-1])
        if latest_close <= 0:
            return False
        if ltp_hint is not None and float(ltp_hint) > 0:
            anchor = float(ltp_hint)
            return abs(latest_close - anchor) <= max(anchor * 10, 250.0)
        highs = frame["high"].dropna()
        if highs.empty:
            return True
        max_high = float(highs.max())
        # Bad non-intraday option responses can contain split/scale artifacts that dwarf LTP.
        return max_high <= max(latest_close * 25, latest_close + 1000)

    def _synthetic_option_quote_chart(self, request: RangeTraderChartRequest, *, reason: str) -> RangeTraderChartResponse:
        if request.ref_id is None:
            raise HTTPException(status_code=404, detail="Option chart fallback needs a ref_id.")
        ltp = float(request.ltp_hint) if request.ltp_hint is not None and float(request.ltp_hint) > 0 else self._get_ltp_price(
            request.session_token,
            request.device_id,
            request.environment,
            int(request.ref_id),
        )
        seconds = {"1m": 60, "3m": 180, "5m": 300, "15m": 900}.get(request.timeframe, 60)
        now = datetime.now(IST)
        bucket = int(now.timestamp()) // seconds * seconds
        candles = [
            RangeTraderCandle(
                epoch_ms=(bucket - (119 - index) * seconds) * 1000,
                open=ltp,
                high=ltp,
                low=ltp,
                close=ltp,
                volume=None,
            )
            for index in range(120)
        ]
        display_name = request.display_name or request.symbol.strip().upper()
        return RangeTraderChartResponse(
            status="success",
            instrument=RangeTraderInstrument(
                symbol=request.symbol.strip().upper(),
                display_name=display_name,
                exchange=request.exchange,
                instrument_type=request.instrument_type.strip().upper(),
                derivative_type=request.derivative_type,
                option_type=request.option_type,
                expiry=request.expiry,
                strike_price=request.strike_price,
                chart_symbol=request.chart_symbol or request.symbol.strip().upper(),
                ltp_hint=request.ltp_hint,
                ref_id=int(request.ref_id),
                tick_size=1,
                lot_size=1,
            ),
            timeframe=request.timeframe,
            last_price=ltp,
            candles=candles,
            synthetic=True,
            synthetic_reason=reason,
        )

    def _chart_symbol_candidates(self, request: RangeTraderChartRequest) -> list[str]:
        candidates: list[str] = []
        refdata_candidates = instrument_service.chart_symbol_candidates(
            request.session_token,
            request.environment,
            request.device_id,
            request.ref_id,
        )
        for value in (*refdata_candidates, request.chart_symbol, request.display_name, request.symbol):
            normalized = str(value or "").strip().upper()
            if normalized and normalized not in candidates:
                candidates.append(normalized)
        if request.option_type and request.strike_price:
            underlying = self._infer_option_underlying(request)
            strike = self._format_option_strike(request.strike_price)
            option_type = request.option_type.strip().upper()
            expiry_variants = self._expiry_symbol_variants(request.expiry)
            option_candidates = [
                f"{underlying}{strike}{option_type}",
                f"{underlying} {strike} {option_type}",
            ]
            for expiry in expiry_variants:
                option_candidates.extend(
                    [
                        f"{underlying}{expiry}{strike}{option_type}",
                        f"{underlying}{expiry}{strike}",
                        f"{underlying} {expiry} {strike} {option_type}",
                        f"{underlying} {strike} {option_type} {expiry}",
                    ]
                )
            for value in option_candidates:
                normalized = value.strip().upper()
                if normalized and normalized not in candidates:
                    candidates.append(normalized)
        return candidates or [request.symbol.strip().upper()]

    def _infer_option_underlying(self, request: RangeTraderChartRequest) -> str:
        for raw in (request.display_name, request.chart_symbol, request.symbol):
            value = str(raw or "").strip().upper()
            if not value:
                continue
            if value.startswith("BANKNIFTY"):
                return "BANKNIFTY"
            if value.startswith("FINNIFTY"):
                return "FINNIFTY"
            if value.startswith("MIDCPNIFTY"):
                return "MIDCPNIFTY"
            if value.startswith("NIFTY"):
                return "NIFTY"
            letters = "".join(ch for ch in value if ch.isalpha())
            for suffix in ("CE", "PE"):
                if letters.endswith(suffix):
                    letters = letters[: -len(suffix)]
            if letters:
                return letters
        return request.symbol.strip().upper()

    def _format_option_strike(self, strike_price: float) -> str:
        value = float(strike_price)
        return str(int(round(value))) if value.is_integer() else str(value).rstrip("0").rstrip(".")

    def _expiry_symbol_variants(self, expiry: str | None) -> list[str]:
        raw = str(expiry or "").strip().upper()
        if not raw:
            return []
        variants = [raw.replace("-", "").replace("/", "").replace(" ", "")]
        for fmt in ("%Y-%m-%d", "%Y%m%d", "%d-%m-%Y", "%d%b%Y", "%d%b%y"):
            try:
                parsed = datetime.strptime(raw, fmt)
            except ValueError:
                continue
            variants.extend(
                [
                    parsed.strftime("%y%m%d").upper(),
                    parsed.strftime("%d%b%y").upper(),
                    parsed.strftime("%d%b%Y").upper(),
                    parsed.strftime("%d%m%y").upper(),
                ]
            )
        deduped: list[str] = []
        for value in variants:
            normalized = value.strip().upper()
            if normalized and normalized not in deduped:
                deduped.append(normalized)
        return deduped[:6]

    def _chart_type_candidates(self, instrument_type: str) -> list[str]:
        normalized = instrument_type.strip().upper()
        aliases = {
            "OPT": ("OPT", "OPTION", "OPTIONS"),
            "OPTION": ("OPT", "OPTION", "OPTIONS"),
            "FUT": ("FUT", "FUTURE", "FUTURES"),
            "FUTURE": ("FUT", "FUTURE", "FUTURES"),
        }
        values = aliases.get(normalized, (normalized,))
        return list(dict.fromkeys(values))

    def list_setups(self, request: RangeTraderSetupListRequest) -> RangeTraderSetupListResponse:
        self._assert_account_owns_token(
            session_token=request.session_token,
            device_id=request.device_id,
            environment=request.environment,
            account_id=request.account_id,
        )
        conn = connect_db()
        try:
            rows = load_range_trader_setups(conn, account_id=request.account_id, environment=request.environment)
        finally:
            conn.close()
        return RangeTraderSetupListResponse(setups=[self._setup_from_row(row) for row in rows])

    def upsert_setup(self, request: RangeTraderSetupUpsertRequest) -> RangeTraderSetupResponse:
        self._assert_account_owns_token(
            session_token=request.session_token,
            device_id=request.device_id,
            environment=request.environment,
            account_id=request.account_id,
        )
        setup_id = request.id or f"rt_{uuid4().hex[:16]}"
        instrument = request.instrument
        conn = connect_db()
        try:
            existing = load_range_trader_setup(conn, setup_id=setup_id) if request.id else None
            if existing is not None and existing["account_id"] == request.account_id and existing["environment"] == request.environment:
                if existing.get("status") == "armed":
                    raise HTTPException(status_code=409, detail="Pause or stop the deployed Range Trader before editing lines or execution settings.")
            payload = request.payload.model_dump()
            payload = self._normalize_payload_runtime_state(payload)
            if request.status == "armed":
                payload = self._reset_payload_for_deploy(payload)
            elif request.status in {"draft", "paused", "stopped"}:
                payload = self._normalize_payload_runtime_state(payload)
        except Exception:
            conn.close()
            raise
        row = {
            "id": setup_id,
            "account_id": request.account_id,
            "environment": request.environment,
            "title": request.title,
            "symbol": instrument.symbol.strip().upper(),
            "display_name": instrument.display_name,
            "exchange": instrument.exchange,
            "instrument_type": instrument.instrument_type,
            "derivative_type": instrument.derivative_type,
            "option_type": instrument.option_type,
            "expiry": instrument.expiry,
            "strike_price": instrument.strike_price,
            "ref_id": instrument.ref_id,
            "tick_size": instrument.tick_size,
            "lot_size": instrument.lot_size,
            "timeframe": request.timeframe,
            "side": request.side,
            "quantity": request.quantity,
            "order_type": request.order_type,
            "tolerance_value": request.tolerance_value,
            "tolerance_mode": request.tolerance_mode,
            "max_loss": request.max_loss,
            "exit_on_max_loss": request.exit_on_max_loss,
            "status": request.status,
            "payload": payload,
        }
        try:
            saved = upsert_range_trader_setup(conn, row)
            append_range_trader_event(
                conn,
                {
                    "id": f"rte_{uuid4().hex[:16]}",
                    "setup_id": setup_id,
                    "account_id": request.account_id,
                    "environment": request.environment,
                    "level": "info",
                    "event_type": "setup_saved",
                    "message": f"Range setup saved for {instrument.display_name}.",
                    "payload": {"status": request.status, "lines": len(request.payload.lines)},
                },
            )
        finally:
            conn.close()
        return RangeTraderSetupResponse(status="success", setup=self._setup_from_row(saved))

    def arm(self, request: RangeTraderControlRequest) -> RangeTraderSetupResponse:
        return self._set_status(request, "armed", "Range trader armed. Lines are now active.")

    def pause(self, request: RangeTraderControlRequest) -> RangeTraderSetupResponse:
        return self._set_status(request, "paused", "Range trader paused.")

    def stop(self, request: RangeTraderControlRequest) -> RangeTraderSetupResponse:
        return self._set_status(request, "stopped", "Range trader stopped.")

    def kill(self, request: RangeTraderKillRequest) -> RangeTraderSetupResponse:
        self._assert_account_owns_token(
            session_token=request.session_token,
            device_id=request.device_id,
            environment=request.environment,
            account_id=request.account_id,
        )
        conn = connect_db()
        try:
            setup = load_range_trader_setup(conn, setup_id=request.setup_id)
            if setup is None or setup["account_id"] != request.account_id or setup["environment"] != request.environment:
                raise HTTPException(status_code=404, detail="Range trader setup not found.")
            payload = setup.get("payload") if isinstance(setup.get("payload"), dict) else {}
            entries = [dict(item) for item in payload.get("entries", []) if isinstance(item, dict)]
            open_entries = [
                entry for entry in entries
                if entry.get("status") == "open" and int(entry.get("quantity") or 0) > 0
            ]
            if request.exit_open_entries and open_entries:
                total_qty = sum(int(entry.get("quantity") or 0) for entry in open_entries)
                side = str(setup["side"])
                exit_side = "ORDER_SIDE_SELL" if side == "BUY" else "ORDER_SIDE_BUY"
                ltp_price = self._get_ltp_price(
                    request.session_token,
                    request.device_id,
                    request.environment,
                    int(setup["ref_id"]),
                )
                result = self._submit_order(
                    session_token=request.session_token,
                    device_id=request.device_id,
                    environment=request.environment,
                    ref_id=int(setup["ref_id"]),
                    exchange=str(setup["exchange"]),
                    tick_size=int(setup["tick_size"]),
                    lot_size=int(setup["lot_size"]),
                    order_side=exit_side,
                    quantity=total_qty,
                    ltp_price=ltp_price,
                    order_type="AGGRESSIVE_LIMIT",
                    limit_price=float(payload["limit_price"]) if payload.get("limit_price") is not None else None,
                    tag=f"rt_kill_{request.setup_id[:8]}",
                )
                remaining = int(result.get("effective_qty") or 0)
                exit_price = float(result["avg_filled_price"]) if result.get("avg_filled_price") is not None else ltp_price
                for entry in open_entries:
                    qty = int(entry.get("quantity") or 0)
                    close_qty = min(qty, remaining)
                    if close_qty <= 0:
                        break
                    remaining -= close_qty
                    entry_price = float(entry.get("entry_price") or exit_price)
                    pnl = (exit_price - entry_price) * close_qty if side == "BUY" else (entry_price - exit_price) * close_qty
                    if close_qty >= qty:
                        entry.update(
                            {
                                "status": "closed",
                                "exit_line_id": "kill_switch",
                                "exit_price": exit_price,
                                "exit_epoch_s": int(datetime.now(IST).timestamp()),
                                "exit_order_id": result.get("order_id"),
                                "exit_order_status": result.get("order_status"),
                                "exit_filled_qty": close_qty,
                                "pnl": round(pnl, 2),
                            }
                        )
                    else:
                        entry["quantity"] = qty - close_qty
                        entry.setdefault("partial_exits", []).append(
                            {
                                "exit_line_id": "kill_switch",
                                "exit_price": exit_price,
                                "exit_epoch_s": int(datetime.now(IST).timestamp()),
                                "exit_order_id": result.get("order_id"),
                                "exit_order_status": result.get("order_status"),
                                "exit_filled_qty": close_qty,
                                "pnl": round(pnl, 2),
                            }
                        )
                payload["entries"] = entries
                update_range_trader_setup_payload(
                    conn,
                    setup_id=request.setup_id,
                    account_id=request.account_id,
                    environment=request.environment,
                    payload=payload,
                    status="stopped",
                )
                append_range_trader_event(
                    conn,
                    {
                        "id": f"rte_{uuid4().hex[:16]}",
                        "setup_id": request.setup_id,
                        "account_id": request.account_id,
                        "environment": request.environment,
                        "level": "error",
                        "event_type": "kill_switch_exit",
                        "message": f"Kill switch sent exit for {total_qty} qty. Filled {result.get('effective_qty') or 0}/{total_qty}.",
                        "payload": {"order": result},
                    },
                )
            setup = update_range_trader_setup_status(
                conn,
                setup_id=request.setup_id,
                account_id=request.account_id,
                environment=request.environment,
                status="stopped",
            )
            append_range_trader_event(
                conn,
                {
                    "id": f"rte_{uuid4().hex[:16]}",
                    "setup_id": request.setup_id,
                    "account_id": request.account_id,
                    "environment": request.environment,
                    "level": "error",
                    "event_type": "kill_switch",
                    "message": "Range trader kill switch engaged.",
                    "payload": {"exit_open_entries": request.exit_open_entries},
                },
            )
        finally:
            conn.close()
        if setup is None:
            raise HTTPException(status_code=404, detail="Range trader setup not found.")
        return RangeTraderSetupResponse(status="success", setup=self._setup_from_row(setup))

    def events(self, request: RangeTraderControlRequest) -> RangeTraderEventsResponse:
        self._assert_account_owns_token(
            session_token=request.session_token,
            device_id=request.device_id,
            environment=request.environment,
            account_id=request.account_id,
        )
        conn = connect_db()
        try:
            rows = load_range_trader_events(
                conn,
                setup_id=request.setup_id,
                account_id=request.account_id,
                environment=request.environment,
            )
        finally:
            conn.close()
        return RangeTraderEventsResponse(events=[RangeTraderEvent(**row) for row in rows])

    def _set_status(self, request: RangeTraderControlRequest, status: str, message: str) -> RangeTraderSetupResponse:
        self._assert_account_owns_token(
            session_token=request.session_token,
            device_id=request.device_id,
            environment=request.environment,
            account_id=request.account_id,
        )
        conn = connect_db()
        try:
            setup = load_range_trader_setup(conn, setup_id=request.setup_id)
            if setup is None or setup["account_id"] != request.account_id or setup["environment"] != request.environment:
                raise HTTPException(status_code=404, detail="Range trader setup not found.")
            payload = setup.get("payload") if isinstance(setup.get("payload"), dict) else {}
            if status == "armed":
                payload = self._reset_payload_for_deploy(payload)
            elif status == "stopped":
                payload = self._normalize_payload_runtime_state(payload)
                if not any(entry.get("status") == "open" for entry in payload.get("entries", []) if isinstance(entry, dict)):
                    payload["position_status"] = "idle"
                    payload["open_quantity"] = 0
            updated = update_range_trader_setup_payload(
                conn,
                setup_id=request.setup_id,
                account_id=request.account_id,
                environment=request.environment,
                payload=payload,
                status=status,
            )
            setup = updated
            if setup is None:
                raise HTTPException(status_code=404, detail="Range trader setup not found.")
            append_range_trader_event(
                conn,
                {
                    "id": f"rte_{uuid4().hex[:16]}",
                    "setup_id": request.setup_id,
                    "account_id": request.account_id,
                    "environment": request.environment,
                    "level": "success" if status == "armed" else "info",
                    "event_type": f"setup_{status}",
                    "message": message,
                    "payload": {},
                },
            )
        finally:
            conn.close()
        return RangeTraderSetupResponse(status="success", setup=self._setup_from_row(setup))

    def _normalize_payload_runtime_state(self, payload: dict) -> dict:
        next_payload = dict(payload or {})
        entries = [dict(item) for item in next_payload.get("entries", []) if isinstance(item, dict)]
        open_entries = [entry for entry in entries if entry.get("status") == "open" and int(entry.get("quantity") or 0) > 0]
        next_payload["entries"] = entries
        next_payload.setdefault("line_states", {})
        if open_entries:
            next_payload["position_status"] = "in_position"
            next_payload["open_quantity"] = sum(int(entry.get("quantity") or 0) for entry in open_entries)
            first = open_entries[0]
            next_payload["entry_order_id"] = first.get("order_id")
            next_payload["entry_price"] = first.get("entry_price")
        else:
            next_payload["position_status"] = next_payload.get("position_status") if next_payload.get("position_status") in {"idle", "closed"} else "idle"
            next_payload["open_quantity"] = 0
        return next_payload

    def _assert_account_owns_token(self, *, session_token: str, device_id: str, environment: str, account_id: str) -> None:
        status = auth_service.session_status(
            SessionStatusRequest(
                session_token=session_token,
                device_id=device_id,
                environment=environment,  # type: ignore[arg-type]
            )
        )
        if not status.active:
            raise HTTPException(status_code=401, detail=status.message)
        if status.account_id and status.account_id != account_id:
            raise HTTPException(status_code=403, detail="Session token does not belong to the requested Range Trader account.")

    def _reset_payload_for_deploy(self, payload: dict) -> dict:
        next_payload = dict(payload or {})
        next_payload["entries"] = []
        next_payload["line_states"] = {}
        next_payload["position_status"] = "idle"
        next_payload["open_quantity"] = 0
        next_payload["entry_order_id"] = None
        next_payload["exit_order_id"] = None
        next_payload["entry_price"] = None
        next_payload["exit_price"] = None
        return next_payload

    def _base_url(self, environment: str) -> str:
        return settings.nubra_uat_base_url if environment == "UAT" else settings.nubra_prod_base_url

    def _request_headers(self, session_token: str, device_id: str) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {session_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "x-device-id": device_id,
        }

    def _get_ltp_price(self, session_token: str, device_id: str, environment: str, ref_id: int) -> float:
        with httpx.Client(timeout=10.0) as client:
            response = client.get(
                f"{self._base_url(environment)}/orderbooks/{ref_id}",
                params={"levels": 1},
                headers=self._request_headers(session_token, device_id),
            )
            if response.status_code >= 400:
                raise HTTPException(status_code=response.status_code, detail=response.text)
            payload = response.json()
        price = normalize_ltp_price(payload)
        if price is None or price <= 0:
            raise HTTPException(status_code=502, detail="Unable to resolve live price for kill switch exit.")
        return price

    def _submit_order(
        self,
        *,
        session_token: str,
        device_id: str,
        environment: str,
        ref_id: int,
        exchange: str,
        tick_size: int,
        lot_size: int,
        order_side: str,
        quantity: int,
        ltp_price: float,
        order_type: str,
        limit_price: float | None = None,
        tag: str,
    ) -> dict[str, object]:
        order_qty = max(int(quantity), max(int(lot_size), 1))
        if lot_size > 1 and order_qty % lot_size != 0:
            order_qty += lot_size - (order_qty % lot_size)
        price_type = "MARKET" if order_type == "MARKET" else "LIMIT"
        payload: dict[str, object] = {
            "ref_id": ref_id,
            "order_type": "ORDER_TYPE_REGULAR",
            "order_qty": order_qty,
            "order_side": order_side,
            "order_delivery_type": "ORDER_DELIVERY_TYPE_IDAY",
            "validity_type": "IOC",
            "price_type": price_type,
            "tag": tag,
            "algo_params": {},
        }
        order_price = None
        if price_type == "LIMIT":
            if order_type == "LIMIT":
                if limit_price is None or limit_price <= 0:
                    raise HTTPException(status_code=400, detail="Limit price is required for LIMIT Range Trader orders.")
                order_price = self._round_limit_price(order_side, limit_price, tick_size)
            else:
                order_price = self._aggressive_limit_price(order_side, ltp_price, tick_size)
            payload["order_price"] = order_price
        url = f"{self._base_url(environment)}/orders/v2/single"
        _log.warning(
            "range_trader submit_order environment=%s exchange=%s url=%s payload=%s",
            environment,
            exchange,
            url,
            payload,
        )
        with httpx.Client(timeout=20.0) as client:
            response = client.post(
                url,
                json=payload,
                headers=self._request_headers(session_token, device_id),
            )
            _log.warning("range_trader submit_order status=%s body=%s", response.status_code, response.text[:500])
            if response.status_code >= 400:
                raise HTTPException(status_code=response.status_code, detail=response.text)
            order = response.json()
        initial = normalize_order_result(
            order,
            None,
            order_qty=order_qty,
            order_price_paise=order_price,
            ltp_price=ltp_price,
        )
        order_id = instrument_service._coerce_positive_int(order.get("order_id")) or initial.get("order_id")  # noqa: SLF001
        snapshot = self._wait_for_order_snapshot(session_token, device_id, environment, order_id) if order_id is not None else None
        normalized = normalize_order_result(
            order,
            snapshot,
            order_qty=order_qty,
            order_price_paise=order_price,
            ltp_price=ltp_price,
        )
        if normalized["order_id"] is None:
            normalized["order_id"] = order_id
        return normalized

    def _fetch_order_snapshot(self, session_token: str, device_id: str, environment: str, order_id: int) -> dict | None:
        with httpx.Client(timeout=10.0) as client:
            response = client.get(
                f"{self._base_url(environment)}/orders/v2/{order_id}",
                headers=self._request_headers(session_token, device_id),
            )
            if response.status_code >= 400:
                return None
            payload = response.json()
        return payload if isinstance(payload, dict) else None

    def _wait_for_order_snapshot(self, session_token: str, device_id: str, environment: str, order_id: int) -> dict | None:
        snapshot = None
        for attempt in range(4):
            snapshot = self._fetch_order_snapshot(session_token, device_id, environment, order_id)
            normalized = normalize_order_result(
                {},
                snapshot,
                order_qty=0,
                order_price_paise=None,
                ltp_price=1.0,
            )
            status = str(normalized.get("order_status") or "").upper()
            filled_qty = int(normalized.get("filled_qty") or 0)
            if filled_qty > 0 or normalized.get("is_terminal") or any(term in status for term in ("FILLED", "REJECT", "CANCEL", "COMPLETE")):
                return snapshot
            if attempt < 3:
                time.sleep(0.75)
        return snapshot

    def _aggressive_limit_price(self, order_side: str, ltp_price: float, tick_size: int) -> int:
        normalized_tick = max(int(tick_size or 1), 1)
        ltp_paise = max(int(round(ltp_price * 100)), normalized_tick)
        if order_side == "ORDER_SIDE_BUY":
            price = int(ltp_paise * 1.02)
            remainder = price % normalized_tick
            return max(price + (normalized_tick - remainder if remainder else 0), normalized_tick)
        price = int(ltp_paise * 0.98)
        price -= price % normalized_tick
        return max(price, normalized_tick)

    def _round_limit_price(self, order_side: str, limit_price: float, tick_size: int) -> int:
        normalized_tick = max(int(tick_size or 1), 1)
        raw = max(int(round(limit_price * 100)), normalized_tick)
        remainder = raw % normalized_tick
        if remainder == 0:
            return raw
        if order_side == "ORDER_SIDE_BUY":
            return raw - remainder
        return raw + (normalized_tick - remainder)

    def _setup_from_row(self, row: dict) -> RangeTraderSetup:
        payload = row.get("payload") if isinstance(row.get("payload"), dict) else {}
        return RangeTraderSetup(
            id=str(row["id"]),
            account_id=str(row["account_id"]),
            environment=row["environment"],
            title=str(row["title"]),
            symbol=str(row["symbol"]),
            display_name=str(row["display_name"]),
            exchange=row["exchange"],
            instrument_type=str(row["instrument_type"]),
            derivative_type=row.get("derivative_type"),
            option_type=row.get("option_type"),
            expiry=row.get("expiry"),
            strike_price=row.get("strike_price"),
            ref_id=int(row["ref_id"]),
            tick_size=int(row["tick_size"]),
            lot_size=int(row["lot_size"]),
            timeframe=row["timeframe"],
            side=row["side"],
            quantity=int(row["quantity"]),
            order_type=row["order_type"],
            tolerance_value=float(row["tolerance_value"]),
            tolerance_mode=row["tolerance_mode"],
            max_loss=row.get("max_loss"),
            exit_on_max_loss=bool(row["exit_on_max_loss"]),
            status=row["status"],
            created_at=str(row["created_at"]),
            updated_at=str(row["updated_at"]),
            payload=payload,
        )


range_trader_service = RangeTraderService()
