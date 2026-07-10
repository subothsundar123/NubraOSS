from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime

import httpx
from fastapi import HTTPException

from app.config import settings

_log = logging.getLogger(__name__)


@dataclass
class InstrumentCacheEntry:
    environment: str
    device_id: str
    rows: list[dict]
    loaded_at: str


class InstrumentService:
    def __init__(self) -> None:
        self._cache: dict[str, InstrumentCacheEntry] = {}

    def _get_base_url(self, environment: str) -> str:
        if environment == "UAT":
            return settings.nubra_uat_base_url
        return settings.nubra_prod_base_url

    def _extract_error(self, response: httpx.Response) -> str:
        try:
            payload = response.json()
        except ValueError:
            payload = {}
        return (
            payload.get("message")
            or payload.get("detail")
            or payload.get("error")
            or f"Nubra request failed with status {response.status_code}."
        )

    def _request_headers(self, session_token: str, device_id: str) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {session_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "x-device-id": device_id,
            "x-app-version": "0.4.5",
            "Cookie": f"deviceId={device_id}",
        }

    def _fetch_exchange_refdata(
        self,
        session_token: str,
        environment: str,
        device_id: str,
        exchange: str,
    ) -> list[dict]:
        base_url = self._get_base_url(environment)
        today_ist = datetime.now().strftime("%Y-%m-%d")
        with httpx.Client(timeout=30.0) as client:
            response = client.get(
                f"{base_url}/refdata/refdata/{today_ist}",
                params={"exchange": exchange},
                headers=self._request_headers(session_token, device_id),
            )
            if response.status_code >= 400:
                raise HTTPException(status_code=response.status_code, detail=self._extract_error(response))
            payload = response.json()
        rows = payload.get("refdata", [])
        return rows if isinstance(rows, list) else []

    def warm_cache(self, session_token: str, environment: str, device_id: str) -> None:
        rows = self._fetch_exchange_refdata(session_token, environment, device_id, "NSE")
        for _ex in ("BSE", "NFO", "MCX"):
            try:
                rows.extend(self._fetch_exchange_refdata(session_token, environment, device_id, _ex))
            except HTTPException:
                pass
        self._cache[session_token] = InstrumentCacheEntry(
            environment=environment,
            device_id=device_id,
            rows=rows,
            loaded_at=datetime.now().isoformat(),
        )

    def _get_cached_rows(self, session_token: str, environment: str, device_id: str) -> list[dict]:
        entry = self._cache.get(session_token)
        if entry and entry.environment == environment and entry.device_id == device_id:
            return entry.rows
        self.warm_cache(session_token, environment, device_id)
        entry = self._cache.get(session_token)
        return entry.rows if entry else []

    def _coerce_positive_int(self, value: object, fallback: int | None = None) -> int | None:
        try:
            coerced = int(value)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return fallback
        if coerced <= 0:
            return fallback
        return coerced

    def _is_cash_stock_row(self, row: dict) -> bool:
        derivative_type = str(row.get("derivative_type") or "").strip().upper()
        option_type = str(row.get("option_type") or "").strip().upper()
        return derivative_type not in {"FUT", "OPT"} and option_type not in {"CE", "PE"}

    def search_stocks(
        self,
        session_token: str,
        environment: str,
        device_id: str,
        query: str,
        limit: int = 8,
    ) -> list[dict]:
        q = query.strip().upper()
        if not q:
            return []
        rows = self._get_cached_rows(session_token, environment, device_id)
        matches: list[tuple[int, dict]] = []
        for row in rows:
            if not self._is_cash_stock_row(row):
                continue
            stock_name = str(row.get("stock_name") or "").strip().upper()
            symbol = str(row.get("symbol") or "").strip().upper()
            nubra_name = str(row.get("nubra_name") or "").strip().upper()
            exchange = str(row.get("exchange") or "").strip().upper()
            if exchange not in {"NSE", "BSE", "NFO"}:
                continue
            score = -1
            if stock_name == q:
                score = 100
            elif symbol == q:
                score = 95
            elif stock_name.startswith(q):
                score = 90
            elif symbol.startswith(q):
                score = 85
            elif q in stock_name:
                score = 70
            elif q in symbol:
                score = 65
            elif q in nubra_name:
                score = 50
            if score < 0:
                continue
            ref_id = self._coerce_positive_int(row.get("ref_id"))
            if ref_id is None:
                continue
            matches.append(
                (
                    score,
                    {
                        "instrument": stock_name or symbol,
                        "display_name": stock_name or symbol,
                        "exchange": exchange,
                        "ref_id": ref_id,
                        "tick_size": self._coerce_positive_int(row.get("tick_size"), 1) or 1,
                        "lot_size": self._coerce_positive_int(row.get("lot_size"), 1) or 1,
                    },
                )
            )
        matches.sort(key=lambda item: (-item[0], item[1]["display_name"], item[1]["exchange"]))
        deduped: list[dict] = []
        seen: set[tuple[str, str]] = set()
        for _, item in matches:
            key = (item["display_name"], item["exchange"])
            if key in seen:
                continue
            seen.add(key)
            deduped.append(item)
            if len(deduped) >= limit:
                break
        return deduped

    def _normalize_instrument_type(self, row: dict) -> str:
        derivative_type = str(row.get("derivative_type") or "").strip().upper()
        option_type = str(row.get("option_type") or "").strip().upper()
        asset_type = str(row.get("asset_type") or "").strip().upper()
        if derivative_type == "OPT" or option_type in {"CE", "PE"}:
            return "OPT"
        if derivative_type == "FUT":
            return "FUT"
        if "INDEX" in asset_type:
            return "INDEX"
        return "STOCK"

    def _normalize_strike(self, raw: object) -> float | None:
        try:
            value = float(raw)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return None
        if value <= 0:
            return None
        return value / 100.0 if value >= 100000 else value

    def chart_symbol_candidates(
        self,
        session_token: str,
        environment: str,
        device_id: str,
        ref_id: int | None,
    ) -> list[str]:
        if ref_id is None:
            return []
        rows = self._get_cached_rows(session_token, environment, device_id)
        candidates: list[str] = []
        for row in rows:
            row_ref = self._coerce_positive_int(row.get("ref_id"))
            if row_ref != ref_id:
                continue
            for key in ("stock_name", "display_name", "nubra_name", "symbol", "asset"):
                value = str(row.get(key) or "").strip().upper()
                if value and value not in candidates:
                    candidates.append(value)
            break
        return candidates

    def search_tradable(
        self,
        session_token: str,
        environment: str,
        device_id: str,
        query: str,
        limit: int = 12,
    ) -> list[dict]:
        q = query.strip().upper()
        if not q:
            return []
        rows = self._get_cached_rows(session_token, environment, device_id)
        matches: list[tuple[int, dict]] = []
        for row in rows:
            exchange = str(row.get("exchange") or "").strip().upper()
            if exchange not in {"NSE", "BSE", "NFO"}:
                continue
            symbol = str(row.get("symbol") or "").strip().upper()
            stock_name = str(row.get("stock_name") or "").strip().upper()
            display_name = str(row.get("display_name") or stock_name or symbol).strip().upper()
            nubra_name = str(row.get("nubra_name") or "").strip().upper()
            asset = str(row.get("asset") or "").strip().upper()
            haystack = (symbol, stock_name, display_name, nubra_name, asset)
            score = -1
            if any(value == q for value in haystack):
                score = 100
            elif any(value.startswith(q) for value in haystack):
                score = 88
            elif any(q in value for value in haystack):
                score = 62
            if score < 0:
                continue
            ref_id = self._coerce_positive_int(row.get("ref_id"))
            if ref_id is None:
                continue
            instrument_type = self._normalize_instrument_type(row)
            derivative_type = str(row.get("derivative_type") or "").strip().upper() or None
            option_type = str(row.get("option_type") or "").strip().upper() or None
            matches.append(
                (
                    score,
                    {
                        "symbol": symbol or stock_name or display_name,
                        "display_name": display_name or stock_name or symbol,
                        "chart_symbol": stock_name or display_name or nubra_name or symbol,
                        "exchange": exchange,
                        "instrument_type": instrument_type,
                        "derivative_type": derivative_type,
                        "option_type": option_type,
                        "expiry": str(row.get("expiry") or row.get("expiry_date") or "").strip() or None,
                        "strike_price": self._normalize_strike(row.get("strike_price")),
                        "ref_id": ref_id,
                        "tick_size": self._coerce_positive_int(row.get("tick_size"), 1) or 1,
                        "lot_size": self._coerce_positive_int(row.get("lot_size"), 1) or 1,
                    },
                )
            )
        matches.sort(
            key=lambda item: (
                -item[0],
                item[1]["exchange"],
                item[1]["display_name"],
                item[1]["instrument_type"],
                item[1].get("expiry") or "",
                item[1].get("strike_price") or 0,
            )
        )
        deduped: list[dict] = []
        seen: set[tuple[int, str]] = set()
        for _, item in matches:
            key = (int(item["ref_id"]), str(item["exchange"]))
            if key in seen:
                continue
            seen.add(key)
            deduped.append(item)
            if len(deduped) >= limit:
                break
        return deduped

    def list_cash_stocks(
        self,
        session_token: str,
        environment: str,
        device_id: str,
        exchanges: tuple[str, ...] = ("NSE", "BSE"),
    ) -> list[dict]:
        rows = self._get_cached_rows(session_token, environment, device_id)
        items: list[dict] = []
        seen: set[tuple[str, str]] = set()
        allowed_exchanges = {exchange.upper() for exchange in exchanges}

        for row in rows:
            if not self._is_cash_stock_row(row):
                continue

            stock_name = str(row.get("stock_name") or "").strip().upper()
            symbol = str(row.get("symbol") or "").strip().upper()
            exchange = str(row.get("exchange") or "").strip().upper()
            if exchange not in allowed_exchanges:
                continue

            ref_id = self._coerce_positive_int(row.get("ref_id"))
            if ref_id is None:
                continue

            display_name = stock_name or symbol
            key = (display_name, exchange)
            if key in seen:
                continue
            seen.add(key)
            items.append(
                {
                    "instrument": display_name,
                    "display_name": display_name,
                    "symbol": symbol or display_name,
                    "exchange": exchange,
                    "ref_id": ref_id,
                    "tick_size": self._coerce_positive_int(row.get("tick_size"), 1) or 1,
                    "lot_size": self._coerce_positive_int(row.get("lot_size"), 1) or 1,
                }
            )

        items.sort(key=lambda item: (item["exchange"], item["display_name"]))
        return items

    def resolve_stock_meta(
        self,
        session_token: str,
        environment: str,
        device_id: str,
        instrument: str,
        exchange: str | None = None,
    ) -> tuple[int, int, int]:
        rows = self.search_stocks(session_token, environment, device_id, instrument, limit=20)
        symbol = instrument.strip().upper()
        normalized_exchange = exchange.strip().upper() if isinstance(exchange, str) and exchange.strip() else None
        for row in rows:
            if normalized_exchange and str(row["exchange"]).upper() != normalized_exchange:
                continue
            if str(row["instrument"]).upper() == symbol:
                return int(row["ref_id"]), int(row["lot_size"]), int(row["tick_size"])
        if normalized_exchange:
            for row in rows:
                if str(row["exchange"]).upper() != normalized_exchange:
                    continue
                return int(row["ref_id"]), int(row["lot_size"]), int(row["tick_size"])
        if rows:
            first = rows[0]
            return int(first["ref_id"]), int(first["lot_size"]), int(first["tick_size"])
        exchange_label = normalized_exchange or "NSE"
        raise HTTPException(status_code=404, detail=f"Unable to resolve ref_id for {symbol} on {exchange_label}.")


    def resolve_option_meta(
        self,
        session_token: str,
        environment: str,
        device_id: str,
        underlying: str,
        strike_price: float,
        option_type: str,
        expiry_hint: str | None = None,
        ref_id_hint: int | None = None,
    ) -> tuple[int, int, int, str, str]:
        """Return (ref_id, lot_size, tick_size, display_name, exchange) for an option contract."""
        rows = self._get_cached_rows(session_token, environment, device_id)
        underlying_upper = underlying.strip().upper()
        option_type_upper = option_type.strip().upper()
        strike_target = int(round(float(strike_price)))

        candidates: list[dict] = []
        for row in rows:
            ref_id = self._coerce_positive_int(row.get("ref_id"))
            if str(row.get("derivative_type") or "").strip().upper() != "OPT":
                continue
            if str(row.get("option_type") or "").strip().upper() != option_type_upper:
                continue
            row_sym = str(row.get("stock_name") or row.get("symbol") or "").strip().upper()
            if underlying_upper not in row_sym and row_sym not in underlying_upper:
                continue
            row_strike_raw = row.get("strike_price")
            normalized_row_strike = self._normalize_strike(row_strike_raw)
            if normalized_row_strike is None:
                continue
            row_strike = int(round(normalized_row_strike))
            if row_strike != strike_target:
                continue
            if ref_id is None:
                continue
            candidates.append(row)

        if not candidates:
            raise HTTPException(
                status_code=404,
                detail=f"Cannot resolve {underlying_upper} {strike_target} {option_type_upper} in refdata. Check session or try refreshing.",
            )

        hint_candidates = [
            row
            for row in candidates
            if ref_id_hint is not None and self._coerce_positive_int(row.get("ref_id")) == ref_id_hint
        ]
        nfo_candidates = [row for row in candidates if str(row.get("exchange") or "").strip().upper() == "NFO"]
        nfo_hint_candidates = [
            row for row in hint_candidates if str(row.get("exchange") or "").strip().upper() == "NFO"
        ]
        exchange_rank = {"NFO": 0, "NSE": 1, "BSE": 2}
        pool = nfo_hint_candidates or nfo_candidates or hint_candidates or candidates
        pool.sort(
            key=lambda row: (
                exchange_rank.get(str(row.get("exchange") or "").strip().upper(), 9),
                str(row.get("stock_name") or row.get("symbol") or ""),
            )
        )

        # Prefer expiry match if hint provided
        chosen = pool[0]
        if expiry_hint and len(pool) > 1:
            hint = expiry_hint.strip().upper()
            for row in pool:
                expiry_val = str(row.get("expiry") or row.get("expiry_date") or "").strip().upper()
                if hint in expiry_val or expiry_val in hint:
                    chosen = row
                    break

        ref_id = int(self._coerce_positive_int(chosen.get("ref_id")) or 0)
        lot_size = int(self._coerce_positive_int(chosen.get("lot_size"), 25) or 25)
        tick_size = int(self._coerce_positive_int(chosen.get("tick_size"), 5) or 5)
        display_name = str(chosen.get("stock_name") or chosen.get("symbol") or f"{underlying_upper}{strike_target}{option_type_upper}")
        exchange = str(chosen.get("exchange") or "NFO").strip().upper()
        _log.warning(
            "resolve_option_meta %s %s %s → ref_id=%s lot=%s tick=%s exchange=%s (hint_match=%s total_candidates=%s)",
            underlying_upper, strike_target, option_type_upper,
            ref_id, lot_size, tick_size,
            exchange, bool(hint_candidates), len(candidates),
        )
        return ref_id, lot_size, tick_size, display_name, exchange


instrument_service = InstrumentService()
