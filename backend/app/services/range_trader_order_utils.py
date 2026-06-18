from __future__ import annotations

from typing import Any


def normalize_order_result(
    order: dict[str, Any],
    snapshot: dict[str, Any] | None,
    *,
    order_qty: int,
    order_price_paise: int | None,
    ltp_price: float,
) -> dict[str, Any]:
    effective = _extract_order_payload(snapshot) or _extract_order_payload(order) or {}
    fallback = _extract_order_payload(order) or {}
    order_id = _coerce_int(_first_present(effective, fallback, ("order_id", "id", "oms_order_id", "exchange_order_id")))
    filled_qty = _coerce_int(
        _first_present(
            effective,
            fallback,
            ("filled_qty", "filled_quantity", "traded_qty", "executed_qty", "filled", "filledQuantity"),
        ),
        default=0,
    ) or 0
    raw_avg_price = _first_present(
        effective,
        fallback,
        (
            "avg_filled_price",
            "average_filled_price",
            "avg_price",
            "average_price",
            "average_traded_price",
            "traded_price",
            "fill_price",
            "filled_price",
        ),
    )
    status = str(
        _first_present(
            effective,
            fallback,
            ("order_status", "status", "orderStatus", "exchange_status"),
        )
        or ""
    ).strip().upper() or None
    reject_reason = _first_present(
        effective,
        fallback,
        ("reject_reason", "rejection_reason", "reason", "message", "detail", "error", "update_msg"),
    )
    status_text = status or ""
    is_rejected = any(term in status_text for term in ("REJECT", "FAILED", "ERROR"))
    is_cancelled = any(term in status_text for term in ("CANCEL", "EXPIRED"))
    is_filled = filled_qty > 0 or any(term in status_text for term in ("FILLED", "TRADED", "COMPLETE"))
    is_terminal = is_filled or is_rejected or is_cancelled
    avg_filled_price = _normalize_price(raw_avg_price, reference_price=ltp_price)
    return {
        "order_id": order_id,
        "order_status": status,
        "order_qty": order_qty,
        "effective_qty": filled_qty if filled_qty > 0 else 0,
        "filled_qty": filled_qty,
        "remaining_qty": max(order_qty - filled_qty, 0) if order_qty > 0 else None,
        "avg_filled_price": avg_filled_price,
        "order_price": round(order_price_paise / 100.0, 2) if order_price_paise else None,
        "reject_reason": str(reject_reason) if reject_reason is not None else None,
        "is_filled": is_filled,
        "is_rejected": is_rejected,
        "is_cancelled": is_cancelled,
        "is_terminal": is_terminal,
        "order_snapshot": effective or fallback or order,
    }


def normalize_ltp_price(payload: dict[str, Any]) -> float | None:
    orderbook = payload.get("orderBook") if isinstance(payload.get("orderBook"), dict) else payload
    raw_price = _first_value(
        orderbook,
        ("ltp", "last_traded_price", "lastTradedPrice", "last_price", "lastPrice"),
    )
    return _normalize_price(raw_price, reference_price=None)


def _extract_order_payload(payload: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None
    for key in ("order", "data", "result"):
        nested = payload.get(key)
        if isinstance(nested, dict):
            return _extract_order_payload(nested) or nested
        if isinstance(nested, list) and nested and isinstance(nested[0], dict):
            return _extract_order_payload(nested[0]) or nested[0]
    for key in ("orders", "items"):
        nested_list = payload.get(key)
        if isinstance(nested_list, list) and nested_list and isinstance(nested_list[0], dict):
            return _extract_order_payload(nested_list[0]) or nested_list[0]
    return payload


def _first_present(primary: dict[str, Any], fallback: dict[str, Any], keys: tuple[str, ...]) -> Any:
    value = _first_value(primary, keys)
    if value is not None:
        return value
    return _first_value(fallback, keys)


def _first_value(payload: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        if key in payload and payload[key] not in (None, ""):
            return payload[key]
    return None


def _coerce_int(value: Any, default: int | None = None) -> int | None:
    if isinstance(value, bool) or value is None:
        return default
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        cleaned = value.strip().replace(",", "")
        if not cleaned:
            return default
        try:
            return int(float(cleaned))
        except ValueError:
            return default
    return default


def _coerce_float(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = value.strip().replace(",", "")
        if not cleaned:
            return None
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


def _normalize_price(value: Any, *, reference_price: float | None) -> float | None:
    raw = _coerce_float(value)
    if raw is None or raw <= 0:
        return None
    if reference_price and reference_price > 0:
        rupee_distance = abs(raw - reference_price)
        paise_distance = abs((raw / 100.0) - reference_price)
        if raw > reference_price * 10 and paise_distance < rupee_distance:
            return round(raw / 100.0, 4)
        return round(raw, 4)
    if raw >= 100000:
        return round(raw / 100.0, 4)
    return round(raw, 4)
