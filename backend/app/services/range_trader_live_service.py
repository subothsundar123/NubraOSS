from __future__ import annotations

import asyncio
import json
import logging
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, time as dt_time
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo

import httpx
from fastapi import HTTPException, WebSocket, WebSocketDisconnect
from google.protobuf.any_pb2 import Any as ProtoAny
from websockets.sync.client import connect as ws_connect

from app.config import settings
from app.db import (
    append_range_trader_event,
    connect_db,
    load_range_trader_setup,
    update_range_trader_setup_payload,
    update_range_trader_setup_status,
)
from app.services.instrument_service import instrument_service
from app.services.nubra_ws_proto import BatchWebSocketOrderbookMessage, GenericData
from app.services.range_trader_order_utils import normalize_order_result

IST = ZoneInfo("Asia/Kolkata")
MARKET_OPEN = dt_time(hour=9, minute=15)
MARKET_CLOSE = dt_time(hour=15, minute=30)
log = logging.getLogger(__name__)


@dataclass
class LineRuntime:
    id: str
    role: str
    shape: str
    label: str
    trigger: str
    repeat_policy: str
    reset_distance: float | None
    close_buffer: float | None
    armed: bool
    points: list[dict[str, float]]
    fired: bool = False
    waiting_for_reset: bool = False
    last_relation: float | None = None
    last_alert_at: float = 0.0
    last_diagnostic_at: float = 0.0
    last_decision: str = "Waiting for touch."
    busy: bool = False


@dataclass
class RangeRuntimeState:
    setup: dict[str, Any]
    lines: dict[str, LineRuntime] = field(default_factory=dict)
    entries: list[dict[str, Any]] = field(default_factory=list)
    position_status: str = "idle"
    open_quantity: int = 0
    realized_pnl: float = 0.0
    unrealized_pnl: float = 0.0
    last_price: float | None = None
    last_tick_epoch_s: int | None = None


def _normalize_epoch_seconds(raw_timestamp: object) -> int:
    timestamp = instrument_service._coerce_positive_int(raw_timestamp, 0) or 0  # noqa: SLF001
    if timestamp >= 10**18:
        return timestamp // 1_000_000_000
    if timestamp >= 10**15:
        return timestamp // 1_000_000
    if timestamp >= 10**12:
        return timestamp // 1000
    return timestamp


class _RuntimeLeaseRegistry:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._leases: dict[str, str] = {}

    def acquire(self, setup_id: str, session_id: str) -> bool:
        with self._lock:
            owner = self._leases.get(setup_id)
            if owner and owner != session_id:
                return False
            self._leases[setup_id] = session_id
            return True

    def release(self, setup_id: str, session_id: str) -> None:
        with self._lock:
            if self._leases.get(setup_id) == session_id:
                self._leases.pop(setup_id, None)


_runtime_leases = _RuntimeLeaseRegistry()


class RangeTraderLiveSession:
    def __init__(self, init: dict[str, Any]) -> None:
        self._session_token = str(init.get("session_token") or "")
        self._device_id = str(init.get("device_id") or "")
        self._account_id = str(init.get("account_id") or "")
        self._environment = str(init.get("environment") or "UAT").upper()
        self._setup_id = str(init.get("setup_id") or "")
        self._session_id = uuid4().hex
        self._ws: WebSocket | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._event_queue: asyncio.Queue[dict[str, Any]] | None = None
        self._closed = False
        self._feed_stop = threading.Event()
        self._feed_thread: threading.Thread | None = None
        self._fallback_task: asyncio.Task | None = None
        self._state: RangeRuntimeState | None = None
        self._last_websocket_tick_at = 0.0
        self._last_status_check_at = 0.0
        self._status_check_interval_s = 1.5

    async def run(self, websocket: WebSocket) -> None:
        self._ws = websocket
        self._loop = asyncio.get_running_loop()
        self._event_queue = asyncio.Queue()

        try:
            self._state = self._load_runtime()
            if not _runtime_leases.acquire(self._setup_id, self._session_id):
                await self._emit_and_persist(
                    "warn",
                    "runtime_duplicate_blocked",
                    "Another Range Trader runtime is already monitoring this setup. This session will observe nothing to avoid duplicate orders.",
                )
                await self._send("runtime_stopped", reason="duplicate_runtime")
                return
            if not self._is_market_open():
                await self._emit_and_persist("warn", "market_closed", "Market is closed. Range Trader will not arm outside market hours.")
                await self._send("runtime_stopped", reason="market_closed")
                return

            await self._send(
                "runtime_init",
                setup=self._public_setup(),
                lines=self._public_lines(),
                entries=self._public_entries(),
                line_states=self._line_states_payload(),
            )
            await self._emit_and_persist("success", "runtime_started", f"Live trigger engine started for {self._state.setup['display_name']}.")
            self._start_feed_thread()
            self._fallback_task = asyncio.create_task(self._fallback_loop())
            await self._consume_events()
        except WebSocketDisconnect:
            pass
        except Exception as exc:
            log.exception("RangeTraderLiveSession failed")
            try:
                await self._emit_and_persist("error", "runtime_error", str(exc))
            except Exception:
                pass
        finally:
            await self._shutdown()

    def _load_runtime(self) -> RangeRuntimeState:
        if not self._session_token or not self._device_id or not self._account_id or not self._setup_id:
            raise HTTPException(status_code=400, detail="Range Trader websocket init is missing required fields.")
        conn = connect_db()
        try:
            setup = load_range_trader_setup(conn, setup_id=self._setup_id)
        finally:
            conn.close()
        if setup is None or setup["account_id"] != self._account_id or setup["environment"] != self._environment:
            raise HTTPException(status_code=404, detail="Range Trader setup not found.")
        if setup["status"] != "armed":
            raise HTTPException(status_code=400, detail="Range Trader setup must be armed before starting live runtime.")
        payload = setup.get("payload") if isinstance(setup.get("payload"), dict) else {}
        line_rows = payload.get("lines") if isinstance(payload.get("lines"), list) else []
        line_states = payload.get("line_states") if isinstance(payload.get("line_states"), dict) else {}
        lines = {
            str(row.get("id")): LineRuntime(
                id=str(row.get("id")),
                role=str(row.get("role") or "alert"),
                shape=str(row.get("shape") or "level"),
                label=str(row.get("label") or "Line"),
                trigger=str(row.get("trigger") or "touch"),
                repeat_policy=str(row.get("repeat_policy") or "once"),
                reset_distance=float(row["reset_distance"]) if row.get("reset_distance") is not None else None,
                close_buffer=float(row["close_buffer"]) if row.get("close_buffer") is not None else None,
                armed=bool(row.get("armed", True)),
                points=[dict(point) for point in row.get("points", []) if isinstance(point, dict)],
                fired=bool((line_states.get(str(row.get("id"))) or {}).get("fired", False)),
                waiting_for_reset=bool((line_states.get(str(row.get("id"))) or {}).get("waiting_for_reset", False)),
            )
            for row in line_rows
            if isinstance(row, dict) and row.get("id")
        }
        entries = payload.get("entries") if isinstance(payload.get("entries"), list) else []
        runtime_entries = [dict(item) for item in entries if isinstance(item, dict)]
        open_quantity = sum(
            int(entry.get("quantity") or 0)
            for entry in runtime_entries
            if entry.get("status") == "open" and int(entry.get("quantity") or 0) > 0
        )
        for entry in runtime_entries:
            if entry.get("status") == "open":
                line = lines.get(str(entry.get("line_id") or ""))
                if line and line.repeat_policy in {"once", "after_exit"}:
                    line.fired = True
        state = RangeRuntimeState(setup=setup, lines=lines, entries=runtime_entries)
        state.open_quantity = open_quantity
        state.position_status = "in_position" if open_quantity > 0 else str(payload.get("position_status") or "idle")
        if state.position_status not in {"idle", "entry_pending", "in_position", "exit_pending", "closed"}:
            state.position_status = "idle"
        state.realized_pnl = round(
            sum(float(entry.get("pnl") or 0) for entry in runtime_entries if entry.get("status") == "closed"),
            2,
        )
        return state

    def _base_url(self) -> str:
        return settings.nubra_uat_base_url if self._environment == "UAT" else settings.nubra_prod_base_url

    def _request_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._session_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "x-device-id": self._device_id,
        }

    def _is_market_open(self) -> bool:
        now = datetime.now(IST)
        if now.weekday() >= 5:
            return False
        return MARKET_OPEN <= now.time() <= MARKET_CLOSE

    def _start_feed_thread(self) -> None:
        self._feed_stop.clear()
        self._feed_thread = threading.Thread(target=self._run_feed_loop, daemon=True, name="range-trader-live-feed")
        self._feed_thread.start()

    def _run_feed_loop(self) -> None:
        if self._state is None:
            return
        ws_url = "wss://uatapi.nubra.io/apibatch/ws" if self._environment == "UAT" else "wss://api.nubra.io/apibatch/ws"
        ref_id = int(self._state.setup["ref_id"])
        payload = json.dumps({"indexes": [], "instruments": [ref_id]}, separators=(",", ":"))
        while not self._feed_stop.is_set() and not self._closed:
            try:
                self._queue({"type": "status", "message": "Connecting to Nubra range tick stream."})
                with ws_connect(
                    ws_url,
                    additional_headers={"x-device-id": self._device_id},
                    max_size=None,
                    open_timeout=20,
                    close_timeout=5,
                ) as websocket:
                    websocket.send(f"batch_subscribe {self._session_token} orderbook {payload}")
                    self._queue({"type": "status", "message": "Range tick stream connected."})
                    for message in websocket:
                        if self._feed_stop.is_set() or self._closed:
                            break
                        if isinstance(message, (bytes, bytearray)):
                            self._dispatch_tick(bytes(message), ref_id)
            except Exception as exc:
                if self._feed_stop.is_set() or self._closed:
                    break
                message = str(exc)
                if self._is_auth_error(message):
                    self._queue({"type": "auth_error", "message": message or "Nubra live runtime rejected this session token."})
                    self._closed = True
                    break
                self._queue({"type": "status", "message": f"Range tick stream reconnecting: {message}"})
                if self._feed_stop.wait(5):
                    break

    def _dispatch_tick(self, raw: bytes, ref_id: int) -> None:
        payload = b""
        channel = ""
        type_url = ""
        try:
            envelope = GenericData()
            envelope.ParseFromString(raw)
            channel = str(getattr(envelope, "key", "") or "").strip().lower()
            payload = bytes(getattr(envelope.data, "value", b"") or b"")
            type_url = str(envelope.data.type_url or "")
        except Exception:
            pass
        if not payload:
            try:
                outer = ProtoAny()
                outer.ParseFromString(raw)
                inner = ProtoAny()
                inner.ParseFromString(outer.value)
                payload = bytes(inner.value)
                type_url = str(inner.type_url or "")
            except Exception:
                return
        if channel != "orderbook" and not type_url.endswith("BatchWebSocketOrderbookMessage"):
            return
        msg = BatchWebSocketOrderbookMessage()
        msg.ParseFromString(payload)
        for item in list(msg.instruments):
            item_ref = instrument_service._coerce_positive_int(getattr(item, "ref_id", None))  # noqa: SLF001
            if item_ref is None:
                item_ref = instrument_service._coerce_positive_int(getattr(item, "inst_id", None))  # noqa: SLF001
            if item_ref != ref_id:
                continue
            price = float(getattr(item, "ltp", 0) or 0) / 100.0
            epoch_s = _normalize_epoch_seconds(getattr(item, "timestamp", 0) or int(time.time()))
            if price > 0 and epoch_s > 0:
                self._last_websocket_tick_at = time.monotonic()
                self._queue({"type": "tick", "price": price, "epoch_s": epoch_s, "source": "websocket"})

    async def _fallback_loop(self) -> None:
        while not self._closed:
            await asyncio.sleep(3)
            if time.monotonic() - self._last_websocket_tick_at < 8:
                continue
            try:
                tick = await asyncio.to_thread(self._poll_quote)
            except Exception as exc:
                log.debug("Range fallback quote failed: %s", exc)
                continue
            if tick:
                self._queue(tick)

    def _poll_quote(self) -> dict[str, Any] | None:
        if self._state is None:
            return None
        ref_id = int(self._state.setup["ref_id"])
        with httpx.Client(timeout=10.0) as client:
            response = client.get(f"{self._base_url()}/orderbooks/{ref_id}", params={"levels": 1}, headers=self._request_headers())
            if response.status_code >= 400:
                return None
            book = response.json().get("orderBook") or {}
        price_raw = book.get("ltp") or book.get("last_traded_price")
        if not isinstance(price_raw, (int, float)) or price_raw <= 0:
            return None
        return {
            "type": "tick",
            "price": float(price_raw) / 100.0,
            "epoch_s": _normalize_epoch_seconds(book.get("timestamp") or book.get("ts") or int(time.time())),
            "source": "poll",
        }

    def _queue(self, event: dict[str, Any]) -> None:
        if self._loop is None or self._event_queue is None or self._closed:
            return
        self._loop.call_soon_threadsafe(self._event_queue.put_nowait, event)

    async def _consume_events(self) -> None:
        if self._event_queue is None:
            return
        while not self._closed:
            event = await self._event_queue.get()
            if event.get("type") == "tick":
                await self._handle_tick(float(event["price"]), int(event["epoch_s"]), str(event.get("source") or ""))
            elif event.get("type") == "status":
                await self._send("status", message=str(event.get("message") or ""))
            elif event.get("type") == "auth_error":
                await self._send("auth_error", message=str(event.get("message") or "Nubra authentication failed."))
                await self._emit_and_persist(
                    "error",
                    "runtime_auth_error",
                    str(event.get("message") or "Nubra authentication failed."),
                )
                self._closed = True

    async def _handle_tick(self, price: float, epoch_s: int, source: str) -> None:
        if self._state is None:
            return
        if await self._refresh_deployment_status() is False:
            return
        previous = self._state.last_price
        previous_epoch_s = self._state.last_tick_epoch_s
        self._state.last_price = price
        self._state.last_tick_epoch_s = epoch_s
        await self._send("tick", price=price, epoch_s=epoch_s, source=source)
        await self._update_unrealized(price)
        await self._check_risk(price)
        if self._closed:
            return
        line_statuses: list[dict[str, Any]] = []
        for line in list(self._state.lines.values()):
            if not line.armed or len(line.points) < 2:
                line.last_decision = "Line is disabled or incomplete."
                continue
            line_price = self._line_price_at(line, epoch_s)
            if line_price is None:
                line.last_decision = "Line price could not be calculated."
                continue
            tolerance = self._tolerance(price)
            distance = abs(price - line_price)
            await self._maybe_emit_approaching(line, price, line_price, distance, tolerance)
            relation = price - line_price
            previous_relation = None
            if previous is not None and previous_epoch_s is not None:
                previous_line_price = self._line_price_at(line, previous_epoch_s)
                if previous_line_price is not None:
                    previous_relation = previous - previous_line_price
            trigger_hit = self._trigger_hit(line, price, line_price, relation, previous_relation, tolerance)
            blocked_reason = self._blocked_reason(line, relation)
            should_fire = trigger_hit and blocked_reason is None
            if trigger_hit and blocked_reason:
                line.last_decision = blocked_reason
                await self._maybe_emit_trigger_blocked(line, price, line_price, blocked_reason)
            elif should_fire:
                line.last_decision = "Trigger hit. Sending order."
            else:
                line.last_decision = f"{distance:.2f} points away from {line.label}."
            line.last_relation = relation
            line_statuses.append(
                {
                    "id": line.id,
                    "label": line.label,
                    "role": line.role,
                    "trigger": line.trigger,
                    "repeat_policy": line.repeat_policy,
                    "armed": line.armed,
                    "fired": line.fired,
                    "waiting_for_reset": line.waiting_for_reset,
                    "line_price": round(line_price, 2),
                    "ltp": round(price, 2),
                    "distance": round(distance, 2),
                    "tolerance": round(tolerance, 4),
                    "relation": round(relation, 4),
                    "decision": line.last_decision,
                    "trigger_hit": trigger_hit,
                    "can_fire": should_fire,
                }
            )
            if should_fire:
                await self._fire_line(line, price, line_price, epoch_s)
        if line_statuses:
            await self._send("line_status", lines=line_statuses, epoch_s=epoch_s)

    def _line_price_at(self, line: LineRuntime, epoch_s: int) -> float | None:
        first, second = line.points[0], line.points[1]
        x1 = float(first.get("time") or 0)
        y1 = float(first.get("price") or 0)
        x2 = float(second.get("time") or 0)
        y2 = float(second.get("price") or 0)
        if y1 <= 0 or y2 <= 0:
            return None
        if line.shape != "trend":
            return y2
        if x1 == x2:
            return y2
        return y1 + ((float(epoch_s) - x1) / (x2 - x1)) * (y2 - y1)

    def _tolerance(self, price: float) -> float:
        if self._state is None:
            return 0.0
        value = float(self._state.setup.get("tolerance_value") or 0)
        mode = str(self._state.setup.get("tolerance_mode") or "percent")
        if mode == "percent":
            return max(price * value / 100.0, float(self._state.setup.get("tick_size") or 1) / 100.0)
        if mode == "ticks":
            return value * (float(self._state.setup.get("tick_size") or 1) / 100.0)
        return value

    async def _maybe_emit_approaching(self, line: LineRuntime, price: float, line_price: float, distance: float, tolerance: float) -> None:
        alert_window = max(tolerance * 20, 1.0)
        if line.role == "entry":
            alert_window = max(alert_window, 2.0)
        if distance > alert_window:
            return
        now = time.monotonic()
        if now - line.last_alert_at < 10:
            return
        line.last_alert_at = now
        symbol = self._state.setup["display_name"] if self._state else "Symbol"
        await self._emit_and_persist(
            "warn",
            "approaching_line",
            f"{symbol} is {distance:.2f} points away from {line.label}. LTP {price:.2f}, line {line_price:.2f}.",
            {"line_id": line.id, "price": price, "line_price": line_price, "distance": distance},
        )

    async def _maybe_emit_trigger_blocked(self, line: LineRuntime, price: float, line_price: float, reason: str) -> None:
        now = time.monotonic()
        if now - line.last_diagnostic_at < 8:
            return
        line.last_diagnostic_at = now
        await self._emit_and_persist(
            "warn",
            "trigger_blocked",
            f"{line.label} was touched at LTP {price:.2f}, but no order fired: {reason}",
            {"line_id": line.id, "price": price, "line_price": line_price, "reason": reason},
        )

    def _trigger_hit(
        self,
        line: LineRuntime,
        price: float,
        line_price: float,
        relation: float,
        previous_relation: float | None,
        tolerance: float,
    ) -> bool:
        crossed_between_ticks = previous_relation is not None and (
            previous_relation == 0
            or relation == 0
            or (previous_relation < 0 < relation)
            or (previous_relation > 0 > relation)
        )
        if line.trigger == "touch":
            return abs(relation) <= tolerance or crossed_between_ticks
        if line.trigger == "cross":
            return crossed_between_ticks
        buffer = float(line.close_buffer or 0)
        if line.trigger == "close_above":
            return price >= line_price + buffer
        if line.trigger == "close_below":
            return price <= line_price - buffer
        return abs(relation) <= tolerance or crossed_between_ticks

    def _blocked_reason(self, line: LineRuntime, relation: float) -> str | None:
        if self._state is None:
            return "runtime state is unavailable."
        if self._state.position_status in {"entry_pending", "exit_pending"}:
            return f"position state is {self._state.position_status}; waiting for broker confirmation."
        if line.role == "entry":
            if self._state.position_status == "in_position":
                return "entry touched again while a position is already open."
            if line.fired and line.repeat_policy == "once":
                return "entry line is already marked fired for this deployment."
            return None
        if line.role in {"exit", "target", "stop_loss"}:
            if self._state.position_status != "in_position":
                return "exit/target/SL touched but no Range Trader position is open."
            return None
        if line.role == "alert":
            return None
        if line.fired and line.repeat_policy == "once":
            return "repeat policy is Only once and this line is already marked fired."
        if line.fired and line.repeat_policy == "after_exit" and self._state is not None:
            has_open_from_line = any(
                entry.get("status") == "open" and entry.get("line_id") == line.id
                for entry in self._state.entries
            )
            if has_open_from_line:
                return "repeat policy waits until the existing entry from this line exits."
        if line.waiting_for_reset and line.reset_distance is not None:
            if abs(relation) < line.reset_distance:
                return f"waiting for reset distance {line.reset_distance:.2f}; current distance is {abs(relation):.2f}."
            line.waiting_for_reset = False
        if line.busy:
            return "an order is already being processed for this line."
        if line.role in {"exit", "target", "stop_loss"} and self._state is not None:
            has_open_entry = any(entry.get("status") == "open" and int(entry.get("quantity") or 0) > 0 for entry in self._state.entries)
            if not has_open_entry:
                return "exit/target/SL line touched but there are no open tile entries."
        return None

    async def _fire_line(self, line: LineRuntime, price: float, line_price: float, epoch_s: int) -> None:
        if self._state is None:
            return
        if line.busy:
            return
        line.busy = True
        try:
            line.fired = True
            if line.repeat_policy == "after_reset_distance":
                line.waiting_for_reset = True
            await self._persist_line_states()
            if line.role == "alert":
                await self._emit_and_persist("info", "line_alert", f"{line.label} touched at {price:.2f}.", {"line_id": line.id})
                return
            if line.role == "entry":
                await self._place_entry(line, price, line_price, epoch_s)
                return
            if line.role in {"exit", "target", "stop_loss"}:
                await self._place_exit(line, price, line_price, epoch_s)
        finally:
            line.busy = False

    async def _place_entry(self, line: LineRuntime, price: float, line_price: float, epoch_s: int) -> None:
        if self._state is None:
            return
        order_side = f"ORDER_SIDE_{self._state.setup['side']}"
        self._state.position_status = "entry_pending"
        self._state.open_quantity = 0
        await self._persist_entries()
        try:
            result = await asyncio.to_thread(self._submit_order, order_side, price, f"rt_{line.role}_{self._setup_id[:8]}")
        except Exception as exc:
            self._state.position_status = "idle"
            self._state.open_quantity = 0
            line.fired = False
            await self._persist_entries()
            await self._emit_and_persist(
                "error",
                "entry_order_failed",
                f"{line.label} entry failed: {exc}",
                {"line_id": line.id, "price": price, "line_price": line_price},
            )
            return
        effective_qty = int(result.get("effective_qty") or 0)
        avg_price = result.get("avg_filled_price")
        order_rejected = bool(result.get("is_rejected"))
        order_cancelled = bool(result.get("is_cancelled"))
        entry_status = "open" if effective_qty > 0 else "pending"
        if order_rejected:
            entry_status = "rejected"
        elif order_cancelled:
            entry_status = "cancelled"
        entry = {
            "id": f"rte_{uuid4().hex[:12]}",
            "line_id": line.id,
            "side": self._state.setup["side"],
            "quantity": effective_qty,
            "requested_qty": result["order_qty"],
            "filled_qty": result.get("filled_qty"),
            "entry_price": float(avg_price) if avg_price is not None and effective_qty > 0 else price,
            "trigger_price": price,
            "line_price": line_price,
            "entry_epoch_s": epoch_s,
            "order_id": result.get("order_id"),
            "order_status": result.get("order_status"),
            "order_price": result.get("order_price"),
            "reject_reason": result.get("reject_reason"),
            "status": entry_status,
        }
        self._state.entries.append(entry)
        if effective_qty > 0:
            self._state.position_status = "in_position"
            self._state.open_quantity = effective_qty
        elif entry_status == "pending":
            self._state.position_status = "entry_pending"
            self._state.open_quantity = 0
        else:
            self._state.position_status = "idle"
            self._state.open_quantity = 0
            line.fired = False
        await self._persist_entries()
        await self._send("entries", entries=self._public_entries(), line_states=self._line_states_payload())
        event_level = "success" if effective_qty > 0 else "warn"
        event_type = "entry_order_sent" if effective_qty > 0 else f"entry_order_{entry_status}"
        status_note = f" Status {result.get('order_status') or entry_status.upper()}."
        if result.get("reject_reason"):
            status_note += f" Reason: {result.get('reject_reason')}."
        await self._emit_and_persist(
            event_level,
            event_type,
            f"{self._state.setup['side']} entry sent for {self._state.setup['display_name']} at {price:.2f}. Filled {effective_qty}/{result['order_qty']}.{status_note}",
            entry,
        )

    async def _place_exit(self, line: LineRuntime, price: float, line_price: float, epoch_s: int) -> None:
        if self._state is None:
            return
        open_entries = [entry for entry in self._state.entries if entry.get("status") == "open" and int(entry.get("quantity") or 0) > 0]
        if not open_entries:
            await self._emit_and_persist("info", "exit_ignored", f"{line.label} touched, but no open Range Trader entries exist.", {"line_id": line.id})
            return
        side = str(self._state.setup["side"])
        exit_side = "ORDER_SIDE_SELL" if side == "BUY" else "ORDER_SIDE_BUY"
        total_qty = sum(int(entry.get("quantity") or 0) for entry in open_entries)
        self._state.position_status = "exit_pending"
        self._state.open_quantity = total_qty
        await self._persist_entries()
        try:
            result = await asyncio.to_thread(self._submit_order, exit_side, price, f"rt_{line.role}_{self._setup_id[:8]}", total_qty)
        except Exception as exc:
            self._state.position_status = "in_position"
            self._state.open_quantity = total_qty
            line.fired = False
            await self._persist_entries()
            await self._emit_and_persist(
                "error",
                "exit_order_failed",
                f"{line.label} exit failed: {exc}",
                {"line_id": line.id, "quantity": total_qty, "price": price, "line_price": line_price},
            )
            return
        remaining_fill = int(result.get("effective_qty") or 0)
        if remaining_fill <= 0:
            exit_pending = not bool(result.get("is_rejected") or result.get("is_cancelled"))
            self._state.position_status = "exit_pending" if exit_pending else "in_position"
            self._state.open_quantity = total_qty
            if not exit_pending:
                line.fired = False
            await self._persist_entries()
            event_type = "exit_order_pending" if exit_pending else "exit_order_rejected" if result.get("is_rejected") else "exit_order_cancelled"
            status_note = f" Status {result.get('order_status') or event_type.replace('exit_order_', '').upper()}."
            if result.get("reject_reason"):
                status_note += f" Reason: {result.get('reject_reason')}."
            await self._emit_and_persist(
                "warn",
                event_type,
                f"{line.label} exit order sent but no filled quantity was reported.{status_note}",
                {"line_id": line.id, "quantity": total_qty, "order": result},
            )
            return
        for entry in open_entries:
            qty = int(entry.get("quantity") or 0)
            close_qty = min(qty, remaining_fill)
            if close_qty <= 0:
                break
            remaining_fill -= close_qty
            entry_price = float(entry.get("entry_price") or price)
            exit_price = float(result["avg_filled_price"]) if result.get("avg_filled_price") is not None else price
            pnl = (exit_price - entry_price) * close_qty if side == "BUY" else (entry_price - exit_price) * close_qty
            if close_qty >= qty:
                entry.update(
                    {
                        "status": "closed",
                        "exit_line_id": line.id,
                        "exit_price": exit_price,
                        "exit_epoch_s": epoch_s,
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
                        "exit_line_id": line.id,
                        "exit_price": exit_price,
                        "exit_epoch_s": epoch_s,
                        "exit_order_id": result.get("order_id"),
                        "exit_order_status": result.get("order_status"),
                        "exit_filled_qty": close_qty,
                        "pnl": round(pnl, 2),
                    }
                )
            self._state.realized_pnl += pnl
        self._state.open_quantity = sum(
            int(entry.get("quantity") or 0)
            for entry in self._state.entries
            if entry.get("status") == "open" and int(entry.get("quantity") or 0) > 0
        )
        self._state.position_status = "in_position" if self._state.open_quantity > 0 else "idle"
        if self._state.position_status == "idle":
            for runtime_line in self._state.lines.values():
                if runtime_line.role == "entry" and runtime_line.repeat_policy == "after_exit":
                    runtime_line.fired = False
        await self._persist_entries()
        await self._send("entries", entries=self._public_entries(), line_states=self._line_states_payload())
        await self._emit_and_persist(
            "success",
            "exit_order_sent",
            f"{line.label} exit sent for {total_qty} qty at {price:.2f}. Filled {result.get('effective_qty') or 0}/{total_qty}.",
            {"line_id": line.id, "quantity": total_qty, "filled_qty": result.get("effective_qty"), "order": result},
        )

    def _submit_order(self, order_side: str, ltp_price: float, tag: str, quantity_override: int | None = None) -> dict[str, Any]:
        if self._state is None:
            raise HTTPException(status_code=400, detail="Range Trader runtime is not initialized.")
        setup = self._state.setup
        ref_id = int(setup["ref_id"])
        lot_size = max(int(setup["lot_size"]), 1)
        tick_size = int(setup["tick_size"])
        resolved_exchange = str(setup.get("exchange") or "")
        if str(setup.get("derivative_type") or "").upper() == "OPT" or str(setup.get("instrument_type") or "").upper() == "OPT":
            try:
                resolved_ref_id, resolved_lot_size, resolved_tick_size, resolved_display_name, resolved_exchange = instrument_service.resolve_option_meta(
                    self._session_token,
                    self._environment,
                    self._device_id,
                    self._infer_option_underlying(str(setup.get("display_name") or setup.get("symbol") or "")),
                    float(setup["strike_price"]),
                    str(setup["option_type"]),
                    expiry_hint=str(setup.get("expiry") or ""),
                )
                log.warning(
                    "range_trader_live resolved option setup_id=%s symbol=%s saved_ref_id=%s saved_exchange=%s resolved_ref_id=%s resolved_exchange=%s resolved_display_name=%s lot_size=%s tick_size=%s",
                    self._setup_id,
                    setup.get("display_name") or setup.get("symbol"),
                    setup.get("ref_id"),
                    setup.get("exchange"),
                    resolved_ref_id,
                    resolved_exchange,
                    resolved_display_name,
                    resolved_lot_size,
                    resolved_tick_size,
                )
                ref_id = int(resolved_ref_id)
                lot_size = int(resolved_lot_size)
                tick_size = int(resolved_tick_size)
            except Exception as exc:
                log.exception(
                    "range_trader_live option resolve failed setup_id=%s symbol=%s saved_ref_id=%s saved_exchange=%s",
                    self._setup_id,
                    setup.get("display_name") or setup.get("symbol"),
                    setup.get("ref_id"),
                    setup.get("exchange"),
                )
        requested_qty = int(quantity_override if quantity_override is not None else setup["quantity"])
        order_qty = max(requested_qty, lot_size)
        if lot_size > 1 and order_qty % lot_size != 0:
            order_qty += lot_size - (order_qty % lot_size)
        price_type = "MARKET" if setup["order_type"] == "MARKET" else "LIMIT"
        payload: dict[str, Any] = {
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
        order_price: int | None = None
        if price_type == "LIMIT":
            setup_payload = setup.get("payload") if isinstance(setup.get("payload"), dict) else {}
            limit_price = setup_payload.get("limit_price")
            if setup["order_type"] == "LIMIT" and tag.startswith("rt_entry_"):
                if limit_price is None or float(limit_price) <= 0:
                    raise HTTPException(status_code=400, detail="Limit price is required for LIMIT Range Trader orders.")
                order_price = self._round_limit_price(order_side, float(limit_price), tick_size)
            else:
                order_price = self._aggressive_limit_price(order_side, ltp_price, tick_size)
            payload["order_price"] = order_price
        url = f"{self._base_url()}/orders/v2/single"
        log.warning(
            "range_trader_live submit_order setup_id=%s environment=%s symbol=%s resolved_exchange=%s url=%s payload=%s",
            self._setup_id,
            self._environment,
            setup.get("display_name") or setup.get("symbol"),
            resolved_exchange,
            url,
            payload,
        )
        with httpx.Client(timeout=20.0) as client:
            response = client.post(url, json=payload, headers=self._request_headers())
            log.warning(
                "range_trader_live submit_order status=%s body=%s",
                response.status_code,
                response.text[:500],
            )
            if response.status_code >= 400:
                raise HTTPException(status_code=response.status_code, detail=self._extract_error(response))
            order = response.json()
        initial = normalize_order_result(
            order,
            None,
            order_qty=order_qty,
            order_price_paise=order_price,
            ltp_price=ltp_price,
        )
        order_id = instrument_service._coerce_positive_int(order.get("order_id")) or initial.get("order_id")  # noqa: SLF001
        snapshot = self._wait_for_order_snapshot(order_id) if order_id is not None else None
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

    def _infer_option_underlying(self, symbol: str) -> str:
        value = symbol.strip().upper()
        for underlying in ("BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "NIFTY"):
            if value.startswith(underlying):
                return underlying
        letters = "".join(ch for ch in value if ch.isalpha())
        for suffix in ("CE", "PE"):
            if letters.endswith(suffix):
                letters = letters[: -len(suffix)]
        return letters or value

    def _fetch_order_snapshot(self, order_id: int) -> dict[str, Any] | None:
        with httpx.Client(timeout=10.0) as client:
            response = client.get(f"{self._base_url()}/orders/v2/{order_id}", headers=self._request_headers())
            if response.status_code >= 400:
                return None
            payload = response.json()
        return payload if isinstance(payload, dict) else None

    def _wait_for_order_snapshot(self, order_id: int) -> dict[str, Any] | None:
        snapshot = None
        for attempt in range(4):
            snapshot = self._fetch_order_snapshot(order_id)
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

    def _extract_error(self, response: httpx.Response) -> str:
        try:
            payload = response.json()
        except ValueError:
            return response.text or f"Nubra request failed with status {response.status_code}."
        return str(payload.get("message") or payload.get("detail") or payload.get("error") or payload)

    def _is_auth_error(self, message: str) -> bool:
        normalized = message.lower()
        return "unauthorized" in normalized or "invalid token" in normalized or "token expired" in normalized

    async def _update_unrealized(self, price: float) -> None:
        if self._state is None:
            return
        side = str(self._state.setup["side"])
        total = 0.0
        for entry in self._state.entries:
            if entry.get("status") != "open":
                continue
            qty = int(entry.get("quantity") or 0)
            entry_price = float(entry.get("entry_price") or price)
            total += (price - entry_price) * qty if side == "BUY" else (entry_price - price) * qty
        self._state.unrealized_pnl = round(total, 2)
        await self._send(
            "pnl",
            realized_pnl=round(self._state.realized_pnl, 2),
            unrealized_pnl=self._state.unrealized_pnl,
            total_pnl=round(self._state.realized_pnl + self._state.unrealized_pnl, 2),
            open_entries=sum(1 for entry in self._state.entries if entry.get("status") == "open"),
        )

    async def _check_risk(self, price: float) -> None:
        if self._state is None:
            return
        max_loss = self._state.setup.get("max_loss")
        if max_loss is None:
            return
        total = self._state.realized_pnl + self._state.unrealized_pnl
        if total > -float(max_loss):
            return
        if self._state.setup.get("exit_on_max_loss"):
            risk_line = LineRuntime(
                id="max_loss",
                role="exit",
                shape="level",
                label="Max Loss",
                trigger="touch",
                repeat_policy="once",
                reset_distance=None,
                close_buffer=None,
                armed=True,
                points=[{"time": float(self._state.last_tick_epoch_s or 0), "price": price}, {"time": float(self._state.last_tick_epoch_s or 0), "price": price}],
            )
            await self._place_exit(risk_line, price, price, self._state.last_tick_epoch_s or int(time.time()))
        await self._lock_risk(f"Max loss breached. Total P&L {total:.2f}. Range Trader stopped.")

    async def _lock_risk(self, message: str) -> None:
        if self._state is None:
            return
        conn = connect_db()
        try:
            update_range_trader_setup_status(
                conn,
                setup_id=self._setup_id,
                account_id=self._account_id,
                environment=self._environment,
                status="risk_locked",
            )
        finally:
            conn.close()
        await self._emit_and_persist("error", "max_loss_breached", message)
        await self._send("runtime_stopped", reason="max_loss")
        self._closed = True

    async def _persist_entries(self) -> None:
        if self._state is None:
            return
        payload = dict(self._state.setup.get("payload") or {})
        payload["entries"] = self._state.entries
        payload["position_status"] = self._state.position_status
        payload["open_quantity"] = self._state.open_quantity
        open_entries = [entry for entry in self._state.entries if entry.get("status") == "open"]
        if open_entries:
            first = open_entries[0]
            payload["entry_order_id"] = first.get("order_id")
            payload["entry_price"] = first.get("entry_price")
        else:
            payload["entry_order_id"] = None
            payload["entry_price"] = None
        closed_entries = [entry for entry in self._state.entries if entry.get("status") == "closed"]
        if closed_entries:
            last = closed_entries[-1]
            payload["exit_order_id"] = last.get("exit_order_id")
            payload["exit_price"] = last.get("exit_price")
        payload["lines"] = [
            {
                "id": line.id,
                "role": line.role,
                "label": line.label,
                "trigger": line.trigger,
                "repeat_policy": line.repeat_policy,
                "reset_distance": line.reset_distance,
                "close_buffer": line.close_buffer,
                "armed": line.armed,
                "points": line.points,
            }
            for line in self._state.lines.values()
        ]
        payload["line_states"] = self._line_states_payload()
        conn = connect_db()
        try:
            updated = update_range_trader_setup_payload(
                conn,
                setup_id=self._setup_id,
                account_id=self._account_id,
                environment=self._environment,
                payload=payload,
            )
            if updated is not None:
                self._state.setup = updated
        finally:
            conn.close()

    async def _persist_line_states(self) -> None:
        if self._state is None:
            return
        payload = dict(self._state.setup.get("payload") or {})
        payload["line_states"] = self._line_states_payload()
        conn = connect_db()
        try:
            updated = update_range_trader_setup_payload(
                conn,
                setup_id=self._setup_id,
                account_id=self._account_id,
                environment=self._environment,
                payload=payload,
            )
            if updated is not None:
                self._state.setup = updated
        finally:
            conn.close()

    def _line_states_payload(self) -> dict[str, dict[str, Any]]:
        if self._state is None:
            return {}
        return {
            line.id: {
                "fired": line.fired,
                "waiting_for_reset": line.waiting_for_reset,
                "last_relation": line.last_relation,
            }
            for line in self._state.lines.values()
        }

    async def _refresh_deployment_status(self) -> bool:
        if self._state is None:
            return False
        now = time.monotonic()
        if now - self._last_status_check_at < self._status_check_interval_s:
            return True
        self._last_status_check_at = now
        conn = connect_db()
        try:
            setup = load_range_trader_setup(conn, setup_id=self._setup_id)
        finally:
            conn.close()
        if setup is None or setup["account_id"] != self._account_id or setup["environment"] != self._environment:
            await self._emit_and_persist("error", "runtime_setup_missing", "Range Trader setup disappeared. Runtime stopped.")
            await self._send("runtime_stopped", reason="setup_missing")
            self._closed = True
            return False
        if setup.get("status") != "armed":
            await self._emit_and_persist("info", "runtime_paused", f"Range Trader runtime stopped because setup status is {setup.get('status')}.")
            await self._send("runtime_stopped", reason=str(setup.get("status") or "stopped"))
            self._closed = True
            return False
        return True

    async def _emit_and_persist(
        self,
        level: str,
        event_type: str,
        message: str,
        payload: dict[str, Any] | None = None,
    ) -> None:
        event = {
            "id": f"rte_{uuid4().hex[:16]}",
            "setup_id": self._setup_id,
            "account_id": self._account_id,
            "environment": self._environment,
            "level": level,
            "event_type": event_type,
            "message": message,
            "payload": payload or {},
        }
        conn = connect_db()
        try:
            saved = append_range_trader_event(conn, event)
        finally:
            conn.close()
        await self._send("event", event={**event, "created_at": saved["created_at"]})

    def _public_setup(self) -> dict[str, Any]:
        return self._state.setup if self._state else {}

    def _public_lines(self) -> list[dict[str, Any]]:
        return [
            {
                "id": line.id,
                "role": line.role,
                "label": line.label,
                "trigger": line.trigger,
                "repeat_policy": line.repeat_policy,
                "armed": line.armed,
            }
            for line in (self._state.lines.values() if self._state else [])
        ]

    def _public_entries(self) -> list[dict[str, Any]]:
        if self._state is None:
            return []
        return [dict(entry) for entry in self._state.entries]

    async def _send(self, msg_type: str, **kwargs: Any) -> None:
        if self._ws is None or self._closed:
            return
        try:
            await self._ws.send_json({"type": msg_type, **kwargs})
        except Exception:
            self._closed = True

    async def _shutdown(self) -> None:
        self._closed = True
        _runtime_leases.release(self._setup_id, self._session_id)
        self._feed_stop.set()
        if self._fallback_task is not None:
            self._fallback_task.cancel()
            try:
                await self._fallback_task
            except asyncio.CancelledError:
                pass
        if self._feed_thread and self._feed_thread.is_alive():
            await asyncio.to_thread(self._feed_thread.join, 2.0)


class RangeTraderQuoteSession:
    def __init__(self, init: dict[str, Any]) -> None:
        self._session_token = str(init.get("session_token") or "")
        self._device_id = str(init.get("device_id") or "")
        self._environment = str(init.get("environment") or "UAT").upper()
        self._ref_id = instrument_service._coerce_positive_int(init.get("ref_id"))  # noqa: SLF001
        self._ws: WebSocket | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._event_queue: asyncio.Queue[dict[str, Any]] | None = None
        self._closed = False
        self._feed_stop = threading.Event()
        self._feed_thread: threading.Thread | None = None
        self._fallback_task: asyncio.Task | None = None
        self._last_websocket_tick_at = 0.0

    async def run(self, websocket: WebSocket) -> None:
        self._ws = websocket
        self._loop = asyncio.get_running_loop()
        self._event_queue = asyncio.Queue()
        try:
            if not self._session_token or not self._device_id or self._ref_id is None:
                await self._send("error", message="Range quote websocket init is missing required fields.")
                return
            await self._send("status", message="Connecting live range chart stream.")
            self._start_feed_thread()
            self._fallback_task = asyncio.create_task(self._fallback_loop())
            await self._consume_events()
        except WebSocketDisconnect:
            pass
        except Exception as exc:
            log.exception("RangeTraderQuoteSession failed")
            try:
                await self._send("error", message=str(exc))
            except Exception:
                pass
        finally:
            await self._shutdown()

    def _base_url(self) -> str:
        return settings.nubra_uat_base_url if self._environment == "UAT" else settings.nubra_prod_base_url

    def _request_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._session_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "x-device-id": self._device_id,
        }

    def _start_feed_thread(self) -> None:
        self._feed_stop.clear()
        self._feed_thread = threading.Thread(target=self._run_feed_loop, daemon=True, name="range-trader-quote-feed")
        self._feed_thread.start()

    def _run_feed_loop(self) -> None:
        if self._ref_id is None:
            return
        ws_url = "wss://uatapi.nubra.io/apibatch/ws" if self._environment == "UAT" else "wss://api.nubra.io/apibatch/ws"
        payload = json.dumps({"indexes": [], "instruments": [self._ref_id]}, separators=(",", ":"))
        while not self._feed_stop.is_set() and not self._closed:
            try:
                self._queue({"type": "status", "message": "Range chart stream connecting."})
                with ws_connect(
                    ws_url,
                    additional_headers={"x-device-id": self._device_id},
                    max_size=None,
                    open_timeout=20,
                    close_timeout=5,
                ) as websocket:
                    websocket.send(f"batch_subscribe {self._session_token} orderbook {payload}")
                    self._queue({"type": "status", "message": "Range chart stream live."})
                    for message in websocket:
                        if self._feed_stop.is_set() or self._closed:
                            break
                        if isinstance(message, (bytes, bytearray)):
                            self._dispatch_tick(bytes(message))
            except Exception as exc:
                if self._feed_stop.is_set() or self._closed:
                    break
                message = str(exc)
                if self._is_auth_error(message):
                    self._queue({"type": "auth_error", "message": message or "Nubra chart stream rejected this session token."})
                    self._closed = True
                    break
                self._queue({"type": "status", "message": f"Range chart stream reconnecting: {message}"})
                if self._feed_stop.wait(5):
                    break

    def _dispatch_tick(self, raw: bytes) -> None:
        if self._ref_id is None:
            return
        payload = b""
        channel = ""
        type_url = ""
        try:
            envelope = GenericData()
            envelope.ParseFromString(raw)
            channel = str(getattr(envelope, "key", "") or "").strip().lower()
            payload = bytes(getattr(envelope.data, "value", b"") or b"")
            type_url = str(envelope.data.type_url or "")
        except Exception:
            pass
        if not payload:
            try:
                outer = ProtoAny()
                outer.ParseFromString(raw)
                inner = ProtoAny()
                inner.ParseFromString(outer.value)
                payload = bytes(inner.value)
                type_url = str(inner.type_url or "")
            except Exception:
                return
        if channel != "orderbook" and not type_url.endswith("BatchWebSocketOrderbookMessage"):
            return
        msg = BatchWebSocketOrderbookMessage()
        msg.ParseFromString(payload)
        for item in list(msg.instruments):
            item_ref = instrument_service._coerce_positive_int(getattr(item, "ref_id", None))  # noqa: SLF001
            if item_ref is None:
                item_ref = instrument_service._coerce_positive_int(getattr(item, "inst_id", None))  # noqa: SLF001
            if item_ref != self._ref_id:
                continue
            price = float(getattr(item, "ltp", 0) or 0) / 100.0
            epoch_s = _normalize_epoch_seconds(getattr(item, "timestamp", 0) or int(time.time()))
            if price > 0 and epoch_s > 0:
                self._last_websocket_tick_at = time.monotonic()
                self._queue({"type": "tick", "price": price, "epoch_s": epoch_s, "source": "websocket"})

    async def _fallback_loop(self) -> None:
        while not self._closed:
            await asyncio.sleep(3)
            if time.monotonic() - self._last_websocket_tick_at < 8:
                continue
            try:
                tick = await asyncio.to_thread(self._poll_quote)
            except Exception as exc:
                log.debug("Range quote fallback failed: %s", exc)
                continue
            if tick:
                self._queue(tick)

    def _poll_quote(self) -> dict[str, Any] | None:
        if self._ref_id is None:
            return None
        with httpx.Client(timeout=10.0) as client:
            response = client.get(f"{self._base_url()}/orderbooks/{self._ref_id}", params={"levels": 1}, headers=self._request_headers())
            if response.status_code >= 400:
                if response.status_code in {401, 403}:
                    self._queue({"type": "auth_error", "message": self._extract_error(response)})
                    self._closed = True
                return None
            book = response.json().get("orderBook") or {}
        price_raw = book.get("ltp") or book.get("last_traded_price")
        if not isinstance(price_raw, (int, float)) or price_raw <= 0:
            return None
        return {
            "type": "tick",
            "price": float(price_raw) / 100.0,
            "epoch_s": _normalize_epoch_seconds(book.get("timestamp") or book.get("ts") or int(time.time())),
            "source": "poll",
        }

    def _queue(self, event: dict[str, Any]) -> None:
        if self._loop is None or self._event_queue is None or self._closed:
            return
        self._loop.call_soon_threadsafe(self._event_queue.put_nowait, event)

    async def _consume_events(self) -> None:
        if self._event_queue is None:
            return
        while not self._closed:
            event = await self._event_queue.get()
            if event.get("type") == "tick":
                await self._send(
                    "tick",
                    price=float(event["price"]),
                    epoch_s=int(event["epoch_s"]),
                    source=str(event.get("source") or ""),
                )
            elif event.get("type") == "status":
                await self._send("status", message=str(event.get("message") or ""))
            elif event.get("type") == "auth_error":
                await self._send("auth_error", message=str(event.get("message") or "Nubra authentication failed."))
                self._closed = True

    async def _send(self, event_type: str, **payload: Any) -> None:
        if self._ws is None:
            return
        try:
            await self._ws.send_json({"type": event_type, **payload})
        except Exception:
            self._closed = True

    async def _shutdown(self) -> None:
        self._closed = True
        self._feed_stop.set()
        if self._fallback_task:
            self._fallback_task.cancel()
            try:
                await self._fallback_task
            except asyncio.CancelledError:
                pass
        if self._feed_thread and self._feed_thread.is_alive():
            await asyncio.to_thread(self._feed_thread.join, 2)

    def _extract_error(self, response: httpx.Response) -> str:
        try:
            payload = response.json()
        except ValueError:
            return response.text or f"Nubra request failed with status {response.status_code}."
        return str(payload.get("message") or payload.get("detail") or payload.get("error") or payload)

    def _is_auth_error(self, message: str) -> bool:
        normalized = message.lower()
        return "unauthorized" in normalized or "invalid token" in normalized or "token expired" in normalized

    async def _send(self, msg_type: str, **kwargs: Any) -> None:
        if self._ws is None or self._closed:
            return
        try:
            await self._ws.send_json({"type": msg_type, **kwargs})
        except Exception:
            self._closed = True

    async def _shutdown(self) -> None:
        self._closed = True
        self._feed_stop.set()
        if self._fallback_task is not None:
            self._fallback_task.cancel()
            try:
                await self._fallback_task
            except asyncio.CancelledError:
                pass
        if self._feed_thread and self._feed_thread.is_alive():
            await asyncio.to_thread(self._feed_thread.join, 2.0)
