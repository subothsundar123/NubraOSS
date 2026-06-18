from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
import logging
import threading
import time
from zoneinfo import ZoneInfo

import httpx
from fastapi import HTTPException

from app.schemas import (
    DeltaNeutralPairRow,
    DeltaNeutralPairsRequest,
    DeltaNeutralPairsResponse,
    ExpiryHeatmapRequest,
    ExpiryHeatmapResponse,
    ExpiryHeatmapRow,
    ScannerOrderPreviewRequest,
    ScannerOrderPreviewResponse,
    ScannerOrderSubmitRequest,
    ScannerOrderSubmitResponse,
    ScalperOrderRequest,
    ScalperOrderResponse,
    ScalperCandle,
    ScalperChartPanel,
    ScalperResolvedOptionPair,
    ScalperSnapshotRequest,
    ScalperSnapshotResponse,
    ScalperVolumeBreakoutRequest,
    ScalperVolumeBreakoutResponse,
    ScalperVolumeBreakoutRow,
)
import asyncio
from concurrent.futures import ThreadPoolExecutor

import pandas as pd

from app.services.instrument_service import instrument_service
from app.services.market_history_service import HistoricalFetchRequest, market_history_service

IST = ZoneInfo("Asia/Kolkata")
log = logging.getLogger(__name__)

INDEX_UNDERLYINGS = {
    "NIFTY": ("NSE", "INDEX"),
    "BANKNIFTY": ("NSE", "INDEX"),
    "FINNIFTY": ("NSE", "INDEX"),
    "MIDCPNIFTY": ("NSE", "INDEX"),
    "SENSEX": ("BSE", "INDEX"),
    "BANKEX": ("BSE", "INDEX"),
}

INDEX_HISTORY_SYMBOL_ALIASES = {
    "NIFTY": ("NIFTY", "NIFTY 50"),
    "BANKNIFTY": ("BANKNIFTY", "NIFTY BANK"),
    "FINNIFTY": ("FINNIFTY", "NIFTY FIN SERVICE"),
    "MIDCPNIFTY": ("MIDCPNIFTY", "NIFTY MID SELECT"),
    "SENSEX": ("SENSEX",),
    "BANKEX": ("BANKEX",),
}

INDEX_UNDERLYING_BY_ALIAS = {
    alias.strip().upper(): canonical
    for canonical, aliases in INDEX_HISTORY_SYMBOL_ALIASES.items()
    for alias in aliases
}


@dataclass(frozen=True, slots=True)
class OptionContract:
    ref_id: int | None
    display_name: str
    option_type: str
    strike_price: int
    expiry_label: str | None
    lot_size: int | None
    tick_size: int | None


class ScalperService:
    _UL_CACHE_TTL = 15.0

    def __init__(self) -> None:
        self._ul_cache: dict[str, tuple[float, object]] = {}
        self._ul_cache_lock = threading.Lock()
        self._log = log

    def _coerce_float(self, value: object) -> float | None:
        try:
            result = float(value)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return None
        if result != result:
            return None
        return result

    def _history_candidates(self, instrument: str, instrument_type: str) -> list[tuple[str, str]]:
        normalized_instrument = instrument.strip().upper()
        if instrument_type != "INDEX":
            return [(instrument_type, normalized_instrument)]

        aliases = INDEX_HISTORY_SYMBOL_ALIASES.get(normalized_instrument, (normalized_instrument,))
        candidates: list[tuple[str, str]] = []
        for alias in aliases:
            normalized_alias = alias.strip().upper()
            candidates.append(("INDEX", normalized_alias))

        # Some historical endpoints resolve index chart history using stock-like
        # symbol labels even when the live feed uses index aliases. Try both
        # styles before giving up so weekend fallbacks still paint the last
        # trading snapshot.
        for alias in aliases:
            normalized_alias = alias.strip().upper()
            fallback_candidate = ("STOCK", normalized_alias)
            if fallback_candidate not in candidates:
                candidates.append(fallback_candidate)
        return candidates

    def _expiry_sort_key(self, expiry_label: str | None) -> tuple[int, str]:
        if not expiry_label:
            return (10**9, "")
        normalized = self._normalize_expiry_request(expiry_label)
        if normalized and len(normalized) == 8 and normalized.isdigit():
            return (int(normalized), normalized)
        return (10**9, str(expiry_label).strip().upper())

    def _last_trading_close(self, value: datetime) -> datetime:
        cursor = value.astimezone(IST)
        while cursor.weekday() >= 5:
            cursor = cursor - timedelta(days=1)
        return cursor.replace(hour=15, minute=30, second=0, microsecond=0)

    def _fetch_latest_history_frame(
        self,
        *,
        request: ScalperSnapshotRequest,
        instrument: str,
        instrument_type: str,
    ):
        lookback_span = timedelta(days=max(request.lookback_days + 2, 7))
        end_dt = self._last_trading_close(datetime.now(IST))
        history_candidates = self._history_candidates(instrument, instrument_type)

        # Group candidates by instrument type so we can batch aliases into
        # a single API call (e.g. NIFTY + NIFTY 50 in one request).
        candidates_by_type: dict[str, list[str]] = {}
        for ctype, csymbol in history_candidates:
            candidates_by_type.setdefault(ctype, []).append(csymbol)

        for _ in range(6):
            start_dt = end_dt - lookback_span
            for ctype, symbols in candidates_by_type.items():
                # Try batch first; if the API rejects it (invalid symbol in batch),
                # fall back to trying each symbol individually.
                try:
                    frames = market_history_service.fetch(
                        HistoricalFetchRequest(
                            session_token=request.session_token,
                            device_id=request.device_id,
                            environment=request.environment,
                            exchange=request.exchange,
                            instrument_type=ctype,
                            interval=request.interval,
                            symbols=tuple(symbols),
                            start_dt=start_dt,
                            end_dt=end_dt,
                        )
                    )
                    for sym in symbols:
                        frame = frames.get(sym.upper())
                        if frame is not None and not frame.empty:
                            return frame
                except HTTPException:
                    # Batch rejected — try each symbol individually
                    for sym in symbols:
                        try:
                            frames = market_history_service.fetch(
                                HistoricalFetchRequest(
                                    session_token=request.session_token,
                                    device_id=request.device_id,
                                    environment=request.environment,
                                    exchange=request.exchange,
                                    instrument_type=ctype,
                                    interval=request.interval,
                                    symbols=(sym,),
                                    start_dt=start_dt,
                                    end_dt=end_dt,
                                )
                            )
                            frame = frames.get(sym.upper())
                            if frame is not None and not frame.empty:
                                return frame
                        except HTTPException:
                            continue
            end_dt = self._last_trading_close(end_dt - timedelta(days=1))
        return None

    def _fetch_underlying_cached(
        self,
        *,
        request: ScalperSnapshotRequest,
        instrument: str,
        instrument_type: str,
    ):
        """Fetch underlying history with a short TTL cache.
        When the user only changes CE/PE strikes, the underlying data is
        identical — this avoids the redundant API call."""
        cache_key = f"{request.environment}:{request.exchange}:{instrument}:{request.interval}"
        with self._ul_cache_lock:
            entry = self._ul_cache.get(cache_key)
            if entry and time.monotonic() < entry[0]:
                self._log.debug("Underlying cache HIT for %s", cache_key)
                return entry[1]

        frame = self._fetch_latest_history_frame(
            request=request,
            instrument=instrument,
            instrument_type=instrument_type,
        )
        if frame is not None and not frame.empty:
            with self._ul_cache_lock:
                self._ul_cache[cache_key] = (time.monotonic() + self._UL_CACHE_TTL, frame)
        return frame

    def _session_baseline_metrics(self, frame, *, lookback_days: int) -> tuple[float | None, float | None, float | None]:
        if frame is None or frame.empty:
            return None, None, None

        localized_index = frame.index.tz_convert(IST) if frame.index.tz is not None else frame.index.tz_localize(IST)
        frame_with_dates = frame.copy()
        frame_with_dates["_session_date"] = [stamp.date() for stamp in localized_index]

        session_dates = list(dict.fromkeys(frame_with_dates["_session_date"].tolist()))
        if not session_dates:
            return None, None, None

        latest_session = session_dates[-1]
        latest_rows = frame_with_dates[frame_with_dates["_session_date"] == latest_session]
        if latest_rows.empty:
            return None, None, None

        latest_row = latest_rows.iloc[-1]
        current_volume = self._coerce_float(latest_row.get("bucket_volume"))
        session_open = self._coerce_float(latest_rows.iloc[0].get("open"))
        session_close = self._coerce_float(latest_row.get("close"))
        price_change_pct: float | None = None
        if session_open is not None and session_open > 0 and session_close is not None:
            price_change_pct = ((session_close - session_open) / session_open) * 100.0

        prior_dates = session_dates[:-1][-lookback_days:]
        prior_volumes = [
            volume
            for session_date in prior_dates
            if (volume := self._coerce_float(frame_with_dates[frame_with_dates["_session_date"] == session_date].iloc[-1].get("bucket_volume"))) is not None
        ]
        if not prior_volumes:
            recent_bars = frame.tail(max(lookback_days, 3) + 1).iloc[:-1]
            prior_volumes = [
                volume
                for volume in (self._coerce_float(value) for value in recent_bars.get("bucket_volume", []))
                if volume is not None
            ]

        average_volume = (sum(prior_volumes) / len(prior_volumes)) if prior_volumes else None
        return current_volume, average_volume, price_change_pct

    def _normalize_underlying(self, underlying: str) -> str:
        normalized = underlying.strip().upper()
        return INDEX_UNDERLYING_BY_ALIAS.get(normalized, normalized)

    def _normalize_expiry_request(self, expiry: str | None) -> str | None:
        if not expiry:
            return None
        cleaned = expiry.strip().upper()
        if not cleaned:
            return None
        for fmt in ("%d %b %y", "%d %B %y", "%Y%m%d", "%d-%m-%Y", "%d-%b-%Y", "%d%b%y", "%d%b%Y", "%d%B%y", "%d%B%Y"):
            try:
                return datetime.strptime(cleaned, fmt).strftime("%Y%m%d")
            except ValueError:
                continue
        digits = "".join(ch for ch in cleaned if ch.isdigit())
        if len(digits) == 8:
            return digits
        return cleaned

    def _normalize_row_strike(self, raw: object) -> int | None:
        try:
            value = int(float(raw))  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return None
        if value <= 0:
            return None
        if value >= 100000:
            return int(round(value / 100))
        return value

    def _normalize_expiry_label(self, row: dict) -> str | None:
        for key in ("display_expiry", "expiry_display", "expiry_label", "expiry", "order_expiry_date"):
            value = row.get(key)
            if value is None:
                continue
            if isinstance(value, (int, float)):
                text = str(int(value)).strip().upper()
            else:
                text = str(value).strip().upper()
            if text:
                normalized = self._normalize_expiry_request(text)
                return normalized or text
        return None

    def _today_expiry_floor(self) -> str:
        return datetime.now(IST).strftime("%Y%m%d")

    def _is_active_expiry(self, expiry_label: str | None) -> bool:
        normalized = self._normalize_expiry_request(expiry_label)
        if not normalized or not (len(normalized) == 8 and normalized.isdigit()):
            return True
        return normalized >= self._today_expiry_floor()

    def _iter_option_rows(self, request: ScalperSnapshotRequest) -> list[dict]:
        rows = instrument_service._get_cached_rows(request.session_token, request.environment, request.device_id)  # noqa: SLF001
        underlying = self._normalize_underlying(request.underlying)
        underlying_aliases = tuple(
            alias.strip().upper()
            for alias in INDEX_HISTORY_SYMBOL_ALIASES.get(underlying, (underlying,))
        )
        option_rows: list[dict] = []
        for row in rows:
            exchange = str(row.get("exchange") or "").strip().upper()
            if exchange != request.exchange:
                continue
            derivative_type = str(row.get("derivative_type") or "").strip().upper()
            option_type = str(row.get("option_type") or "").strip().upper()
            asset = self._normalize_underlying(str(row.get("asset") or ""))
            stock_name = str(row.get("stock_name") or "").strip().upper()
            if derivative_type != "OPT" or option_type not in {"CE", "PE"}:
                continue
            if asset != underlying and not any(stock_name.startswith(alias) for alias in underlying_aliases):
                continue
            option_rows.append(row)
        return option_rows

    def _get_scalper_snapshot_spot(self, request: ScalperSnapshotRequest) -> float | None:
        return self._get_underlying_spot(
            DeltaNeutralPairsRequest(
                session_token=request.session_token,
                device_id=request.device_id,
                environment=request.environment,
                underlying=request.underlying,
                exchange=request.exchange,
                expiry=request.expiry,
                limit=5,
            )
        )

    def _resolve_option_pair(
        self,
        request: ScalperSnapshotRequest,
        *,
        spot_price: float | None = None,
    ) -> tuple[OptionContract, OptionContract]:
        option_rows = self._iter_option_rows(request)
        if not option_rows:
            raise HTTPException(status_code=404, detail=f"No option contracts found for {request.underlying} on {request.exchange}.")

        normalized_rows = self._normalize_option_contracts(option_rows, request.expiry)
        if not normalized_rows:
            raise HTTPException(status_code=404, detail="No option contracts matched the selected expiry.")

        call_candidates = [row for row in normalized_rows if row.option_type == "CE"]
        put_candidates = [row for row in normalized_rows if row.option_type == "PE"]
        if not call_candidates or not put_candidates:
            raise HTTPException(status_code=404, detail="Could not resolve both CE and PE contracts for the selected strike.")

        candidate_strikes = sorted({row.strike_price for row in normalized_rows})
        fallback_atm_strike = candidate_strikes[len(candidate_strikes) // 2] if candidate_strikes else 1
        resolved_atm_strike = (
            min(candidate_strikes, key=lambda strike: abs(strike - spot_price))
            if candidate_strikes and spot_price is not None
            else fallback_atm_strike
        )
        requested_ce_strike = int(request.ce_strike_price) if int(request.ce_strike_price) > 1 else resolved_atm_strike
        requested_pe_strike = int(request.pe_strike_price) if int(request.pe_strike_price) > 1 else resolved_atm_strike

        call = min(call_candidates, key=lambda row: (abs(row.strike_price - requested_ce_strike), row.expiry_label or "", row.display_name))
        put = min(put_candidates, key=lambda row: (abs(row.strike_price - requested_pe_strike), row.expiry_label or "", row.display_name))
        return call, put

    def _normalize_option_contracts(self, option_rows: list[dict], expiry: str | None) -> list[OptionContract]:
        target_expiry = self._normalize_expiry_request(expiry)
        normalized_rows: list[OptionContract] = []
        for row in option_rows:
            strike = self._normalize_row_strike(row.get("strike_price"))
            display_name = str(row.get("display_name") or row.get("symbol") or row.get("stock_name") or "").strip().upper()
            if strike is None or not display_name:
                continue
            normalized_rows.append(
                OptionContract(
                    ref_id=instrument_service._coerce_positive_int(row.get("ref_id")),  # noqa: SLF001
                    display_name=display_name,
                    option_type=str(row.get("option_type") or "").strip().upper(),
                    strike_price=strike,
                    expiry_label=self._normalize_expiry_label(row),
                    lot_size=instrument_service._coerce_positive_int(row.get("lot_size")),  # noqa: SLF001
                    tick_size=instrument_service._coerce_positive_int(row.get("tick_size")),  # noqa: SLF001
                )
            )

        active_rows = [row for row in normalized_rows if self._is_active_expiry(row.expiry_label)]
        if active_rows:
            normalized_rows = active_rows

        if target_expiry and not self._is_active_expiry(target_expiry):
            target_expiry = None

        if target_expiry:
            matching_rows = [row for row in normalized_rows if row.expiry_label == target_expiry]
            if matching_rows:
                normalized_rows = matching_rows
            else:
                target_expiry = None

        if not target_expiry and normalized_rows:
            nearest_expiry = min(
                (row.expiry_label for row in normalized_rows if row.expiry_label and self._is_active_expiry(row.expiry_label)),
                key=self._expiry_sort_key,
                default=None,
            )
            if nearest_expiry:
                normalized_rows = [row for row in normalized_rows if row.expiry_label == nearest_expiry]
        return normalized_rows

    def _nearest_expiry_and_atm_strike(
        self,
        *,
        request: ScalperVolumeBreakoutRequest,
        underlying: str,
        spot_price: float | None,
    ) -> tuple[str | None, int | None]:
        option_rows = self._iter_option_rows(
            self._build_scalper_request(
                session_token=request.session_token,
                device_id=request.device_id,
                environment=request.environment,
                underlying=underlying,
                exchange=request.exchange,
                interval=request.interval,
                expiry=None,
            )
        )
        normalized_rows = self._normalize_option_contracts(option_rows, None)
        if not normalized_rows:
            return None, None

        nearest_expiry = next((row.expiry_label for row in normalized_rows if row.expiry_label), None)
        strikes = sorted({row.strike_price for row in normalized_rows})
        if not strikes:
            return nearest_expiry, None

        if spot_price is None:
            return nearest_expiry, strikes[len(strikes) // 2]
        return nearest_expiry, min(strikes, key=lambda strike: abs(strike - spot_price))

    def _build_scalper_request(
        self,
        *,
        session_token: str,
        device_id: str,
        environment: str,
        underlying: str,
        exchange: str,
        interval: str,
        expiry: str | None,
    ) -> ScalperSnapshotRequest:
        return ScalperSnapshotRequest(
            session_token=session_token,
            device_id=device_id,
            environment=environment,
            underlying=underlying,
            exchange=exchange,
            interval=interval,
            ce_strike_price=1,
            pe_strike_price=1,
            expiry=expiry,
            lookback_days=5,
        )

    def _latest_option_metrics(
        self,
        *,
        request: ScalperSnapshotRequest,
        instrument: str,
    ) -> dict[str, float | None]:
        frame = self._fetch_latest_history_frame(
            request=request,
            instrument=instrument,
            instrument_type="OPT",
        )
        if frame is None or frame.empty:
            return {
                "last_price": None,
                "volume": None,
                "change_pct": None,
            }

        recent = frame.tail(2)
        latest = recent.iloc[-1]
        last_price = float(latest["close"])
        bucket_volume = latest.get("bucket_volume")
        volume = float(bucket_volume) if bucket_volume is not None else None

        change_pct: float | None = None
        if len(recent) > 1:
            previous_close = float(recent.iloc[-2]["close"])
            if previous_close > 0:
                change_pct = ((last_price - previous_close) / previous_close) * 100.0

        return {
            "last_price": last_price,
            "volume": volume,
            "change_pct": change_pct,
        }

    def _get_base_url(self, environment: str) -> str:
        if environment == "UAT":
            from app.config import settings
            return settings.nubra_uat_base_url
        from app.config import settings
        return settings.nubra_prod_base_url

    def _request_headers(self, session_token: str, device_id: str) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {session_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "x-device-id": device_id,
        }

    def _compute_aggressive_limit_price(self, order_side: str, ltp_price: float | None, tick_size: int | None) -> int:
        normalized_tick = max(int(tick_size or 1), 1)
        ltp_paise = max(int(round((ltp_price or 0.0) * 100)), normalized_tick)
        if order_side == "ORDER_SIDE_BUY":
            aggressive_price = int(ltp_paise * 1.02)
            remainder = aggressive_price % normalized_tick
            if remainder:
                aggressive_price += normalized_tick - remainder
        else:
            aggressive_price = int(ltp_paise * 0.98)
            aggressive_price -= aggressive_price % normalized_tick
            if aggressive_price <= 0:
                aggressive_price = normalized_tick
        return max(aggressive_price, normalized_tick)

    def _get_underlying_spot(self, request: DeltaNeutralPairsRequest) -> float | None:
        base_url = self._get_base_url(request.environment)
        params = {"exchange": request.exchange} if request.exchange == "BSE" else None
        try:
            with httpx.Client(timeout=20.0) as client:
                response = client.get(
                    f"{base_url}/optionchains/{request.underlying}/price",
                    params=params,
                    headers=self._request_headers(request.session_token, request.device_id),
                )
                if response.status_code >= 400:
                    return None
                payload = response.json()
        except Exception:
            return None
        price = payload.get("price")
        if not isinstance(price, (int, float)) or price <= 0:
            return None
        return float(price) / 100.0

    def _get_scalper_underlying_spot(self, request: ScalperVolumeBreakoutRequest, underlying: str) -> float | None:
        return self._get_underlying_spot(
            DeltaNeutralPairsRequest(
                session_token=request.session_token,
                device_id=request.device_id,
                environment=request.environment,
                underlying=underlying,
                exchange=request.exchange,
                expiry=None,
                limit=5,
            )
        )

    def _get_option_chain_snapshot(self, request: DeltaNeutralPairsRequest) -> dict | None:
        base_url = self._get_base_url(request.environment)
        params: dict[str, str] = {"exchange": request.exchange} if request.exchange == "BSE" else {}
        normalized_expiry = self._normalize_expiry_request(request.expiry)
        if normalized_expiry:
            params["expiry"] = normalized_expiry
        try:
            with httpx.Client(timeout=20.0) as client:
                response = client.get(
                    f"{base_url}/optionchains/{request.underlying}",
                    params=params or None,
                    headers=self._request_headers(request.session_token, request.device_id),
                )
                self._log.warning(
                    "option_chain_snapshot %s status=%s keys=%s",
                    request.underlying,
                    response.status_code,
                    list(response.json().keys()) if response.status_code < 400 else response.text[:200],
                )
                if response.status_code >= 400:
                    return None
                payload = response.json()
        except Exception as exc:
            self._log.warning("option_chain_snapshot exception for %s: %s", request.underlying, exc)
            return None
        if not isinstance(payload, dict):
            self._log.warning("option_chain_snapshot non-dict response for %s: type=%s", request.underlying, type(payload).__name__)
            return None
        return payload

    def _debug_option_chain_raw(self, session_token: str, device_id: str, environment: str, underlying: str) -> dict:
        """Return the raw broker option chain payload for diagnostic purposes."""
        base_url = self._get_base_url(environment)
        try:
            with httpx.Client(timeout=20.0) as client:
                response = client.get(
                    f"{base_url}/optionchains/{underlying.upper()}",
                    headers=self._request_headers(session_token, device_id),
                )
                return {
                    "status_code": response.status_code,
                    "url": str(response.url),
                    "payload": response.json() if "json" in response.headers.get("content-type", "") else response.text[:2000],
                }
        except Exception as exc:
            return {"error": str(exc)}

    def _extract_option_chain_delta_maps(
        self,
        request: DeltaNeutralPairsRequest,
        normalized_rows: list[OptionContract],
    ) -> tuple[dict[int, float], dict[int, float], str | None]:
        payload = self._get_option_chain_snapshot(request)
        if not payload:
            return {}, {}, None

        selected_expiry = next((row.expiry_label for row in normalized_rows if row.expiry_label), None)
        payload_expiry = self._normalize_expiry_request(str(payload.get("expiry") or "").strip()) if payload.get("expiry") else None
        effective_expiry = selected_expiry or payload_expiry

        call_delta_by_strike: dict[int, float] = {}
        put_delta_by_strike: dict[int, float] = {}

        ce_rows = payload.get("ce") or payload.get("calls") or []
        pe_rows = payload.get("pe") or payload.get("puts") or []

        if isinstance(ce_rows, list):
            for row in ce_rows:
                if not isinstance(row, dict):
                    continue
                strike = self._normalize_row_strike(row.get("sp") if row.get("sp") is not None else row.get("strike_price"))
                delta = self._coerce_float(row.get("delta"))
                if strike is None or delta is None:
                    continue
                call_delta_by_strike[strike] = abs(delta)

        if isinstance(pe_rows, list):
            for row in pe_rows:
                if not isinstance(row, dict):
                    continue
                strike = self._normalize_row_strike(row.get("sp") if row.get("sp") is not None else row.get("strike_price"))
                delta = self._coerce_float(row.get("delta"))
                if strike is None or delta is None:
                    continue
                put_delta_by_strike[strike] = -abs(delta)

        return call_delta_by_strike, put_delta_by_strike, effective_expiry

    def delta_neutral_pairs(self, request: DeltaNeutralPairsRequest) -> DeltaNeutralPairsResponse:
        option_rows = self._iter_option_rows(
            self._build_scalper_request(
                session_token=request.session_token,
                device_id=request.device_id,
                environment=request.environment,
                underlying=request.underlying,
                exchange=request.exchange,
                interval="1m",
                expiry=request.expiry,
            )
        )
        normalized_rows = self._normalize_option_contracts(option_rows, request.expiry)
        if not normalized_rows:
            raise HTTPException(status_code=404, detail="No option contracts matched the selected expiry.")

        spot_price = self._get_underlying_spot(request)
        strikes = sorted({row.strike_price for row in normalized_rows})
        if not strikes:
            raise HTTPException(status_code=404, detail="No valid option strikes were found for the selected underlying.")

        if spot_price is not None:
            center_strike = min(strikes, key=lambda strike: abs(strike - spot_price))
        else:
            center_strike = strikes[len(strikes) // 2]

        calls_by_strike = {row.strike_price: row for row in normalized_rows if row.option_type == "CE"}
        puts_by_strike = {row.strike_price: row for row in normalized_rows if row.option_type == "PE"}
        call_delta_by_strike, put_delta_by_strike, effective_expiry = self._extract_option_chain_delta_maps(request, normalized_rows)

        candidate_call_strikes = sorted(calls_by_strike, key=lambda strike: abs(strike - center_strike))[: max(request.limit + 4, 8)]
        candidate_put_strikes = sorted(puts_by_strike, key=lambda strike: abs(strike - center_strike))[: max(request.limit + 4, 8)]

        scored_pairs: list[tuple[float, int, float, DeltaNeutralPairRow]] = []
        seen_pairs: set[tuple[int, int]] = set()

        for ce_strike in candidate_call_strikes:
            call_contract = calls_by_strike.get(ce_strike)
            call_delta = call_delta_by_strike.get(ce_strike)
            if not call_contract or call_delta is None:
                continue
            for pe_strike in candidate_put_strikes:
                put_contract = puts_by_strike.get(pe_strike)
                put_delta = put_delta_by_strike.get(pe_strike)
                if not put_contract or put_delta is None:
                    continue
                pair_key = (ce_strike, pe_strike)
                if pair_key in seen_pairs:
                    continue
                seen_pairs.add(pair_key)
                width_points = abs(ce_strike - pe_strike)
                midpoint_distance = abs(((ce_strike + pe_strike) / 2) - center_strike)
                net_delta = call_delta + put_delta
                neutrality_score = max(0.0, 100.0 - (abs(net_delta) * 100.0))
                scored_pairs.append(
                    (
                        abs(net_delta),
                        width_points,
                        midpoint_distance,
                        DeltaNeutralPairRow(
                            rank=0,
                            underlying=request.underlying,
                            exchange=request.exchange,
                            expiry=effective_expiry or call_contract.expiry_label or put_contract.expiry_label,
                            ce_strike_price=ce_strike,
                            pe_strike_price=pe_strike,
                            call_display_name=call_contract.display_name,
                            put_display_name=put_contract.display_name,
                            spot_price=spot_price,
                            center_strike=center_strike,
                            width_points=width_points,
                            call_delta=round(call_delta, 4),
                            put_delta=round(put_delta, 4),
                            net_delta=round(net_delta, 4),
                            neutrality_score=round(neutrality_score, 2),
                            lot_size=call_contract.lot_size or put_contract.lot_size,
                            tick_size=call_contract.tick_size or put_contract.tick_size,
                        ),
                    ),
                  )

        used_delta_fallback = False
        if not scored_pairs:
            used_delta_fallback = True
            strike_step = min(
                (abs(right - left) for left, right in zip(strikes, strikes[1:]) if abs(right - left) > 0),
                default=50,
            )
            for ce_strike in candidate_call_strikes:
                call_contract = calls_by_strike.get(ce_strike)
                if not call_contract:
                    continue
                for pe_strike in candidate_put_strikes:
                    put_contract = puts_by_strike.get(pe_strike)
                    if not put_contract:
                        continue
                    pair_key = (ce_strike, pe_strike)
                    if pair_key in seen_pairs:
                        continue
                    seen_pairs.add(pair_key)
                    width_points = abs(ce_strike - pe_strike)
                    midpoint_distance = abs(((ce_strike + pe_strike) / 2) - center_strike)
                    width_steps = width_points / max(strike_step, 1)
                    midpoint_steps = midpoint_distance / max(strike_step, 1)
                    neutrality_score = max(0.0, 100.0 - (width_steps * 12.0) - (midpoint_steps * 6.0))
                    scored_pairs.append(
                        (
                            width_points,
                            int(midpoint_distance),
                            ce_strike + pe_strike,
                            DeltaNeutralPairRow(
                                rank=0,
                                underlying=request.underlying,
                                exchange=request.exchange,
                                expiry=effective_expiry or call_contract.expiry_label or put_contract.expiry_label,
                                ce_strike_price=ce_strike,
                                pe_strike_price=pe_strike,
                                call_display_name=call_contract.display_name,
                                put_display_name=put_contract.display_name,
                                spot_price=spot_price,
                                center_strike=center_strike,
                                width_points=width_points,
                                call_delta=None,
                                put_delta=None,
                                net_delta=None,
                                neutrality_score=round(neutrality_score, 2),
                                lot_size=call_contract.lot_size or put_contract.lot_size,
                                tick_size=call_contract.tick_size or put_contract.tick_size,
                            ),
                        ),
                    )

        scored_pairs.sort(key=lambda item: (item[0], item[1], item[2]))
        pairs: list[DeltaNeutralPairRow] = []
        for index, (_, _, _, row) in enumerate(scored_pairs[: request.limit], start=1):
            row.rank = index
            pairs.append(row)

        return DeltaNeutralPairsResponse(
            status="success",
            message=(
                "Delta-neutral candidate pairs ranked using Nubra option delta values."
                if not used_delta_fallback
                else "Live delta values were unavailable, so the nearest structured CE / PE pairs are shown for demo selection."
            ),
            pairs=pairs,
        )

    def volume_breakout_finder(self, request: ScalperVolumeBreakoutRequest) -> ScalperVolumeBreakoutResponse:
        candidate_underlyings = [symbol for symbol, (exchange, _) in INDEX_UNDERLYINGS.items() if exchange == request.exchange]
        if not candidate_underlyings:
            return ScalperVolumeBreakoutResponse(
                status="success",
                message="No option-tradable underlyings are configured for this exchange yet.",
                lookback_days=request.lookback_days,
                rows=[],
            )

        breakout_rows: list[ScalperVolumeBreakoutRow] = []
        for underlying in candidate_underlyings:
            _, instrument_type = INDEX_UNDERLYINGS[underlying]
            history_request = self._build_scalper_request(
                session_token=request.session_token,
                device_id=request.device_id,
                environment=request.environment,
                underlying=underlying,
                exchange=request.exchange,
                interval=request.interval,
                expiry=None,
            )
            history_request.lookback_days = request.lookback_days
            frame = self._fetch_latest_history_frame(
                request=history_request,
                instrument=underlying,
                instrument_type=instrument_type,
            )
            if frame is None or frame.empty:
                continue

            current_volume, average_volume, price_change_pct = self._session_baseline_metrics(frame, lookback_days=request.lookback_days)
            latest_close = self._coerce_float(frame.iloc[-1].get("close"))
            volume_ratio = (current_volume / average_volume) if current_volume is not None and average_volume and average_volume > 0 else 0.0
            breakout_strength = max(0.0, min(100.0, (volume_ratio * 35.0) + (abs(price_change_pct or 0.0) * 8.0)))

            if volume_ratio >= 2.25:
                status_label = "Strong"
            elif volume_ratio >= 1.5:
                status_label = "Active"
            else:
                status_label = "Watching"

            spot_price = self._get_scalper_underlying_spot(request, underlying) or latest_close
            nearest_expiry, atm_strike = self._nearest_expiry_and_atm_strike(
                request=request,
                underlying=underlying,
                spot_price=spot_price,
            )

            breakout_rows.append(
                ScalperVolumeBreakoutRow(
                    rank=0,
                    underlying=underlying,
                    display_name=underlying,
                    exchange=request.exchange,
                    last_price=spot_price,
                    current_volume=current_volume,
                    average_volume=average_volume,
                    volume_ratio=round(volume_ratio, 2),
                    price_change_pct=round(price_change_pct, 2) if price_change_pct is not None else None,
                    breakout_strength=round(breakout_strength, 1),
                    status_label=status_label,
                    nearest_expiry=nearest_expiry,
                    atm_strike=atm_strike,
                )
            )

        breakout_rows.sort(
            key=lambda row: (
                -(row.volume_ratio or 0.0),
                -(abs(row.price_change_pct or 0.0)),
                row.underlying,
            )
        )
        rows = []
        for rank, row in enumerate(breakout_rows[: request.limit], start=1):
            row.rank = rank
            rows.append(row)

        return ScalperVolumeBreakoutResponse(
            status="success",
            message=(
                "Top option-tradable underlyings ranked by latest volume breakout signal. "
                "Live data is used when available, with recent trading-session fallback after market hours."
                if rows
                else "No breakout candidates are available for the selected lookback yet."
            ),
            lookback_days=request.lookback_days,
            rows=rows,
        )

    def _normalize_order_qty(self, lot_size: int, requested_qty: int) -> int:
        normalized = max(int(requested_qty), max(int(lot_size), 1))
        if lot_size > 1:
            remainder = normalized % lot_size
            if remainder != 0:
                normalized += lot_size - remainder
        return normalized

    def _normalize_price_rupees(self, order_price: int | float | None) -> float | None:
        if order_price is None:
            return None
        value = self._coerce_float(order_price)
        if value is None:
            return None
        if value > 1000:
            value /= 100.0
        return round(value, 2)

    def _build_single_order_payload(
        self,
        *,
        instrument_ref_id: int,
        order_qty: int,
        order_side: str,
        order_delivery_type: str,
        order_price: int,
        tag: str,
    ) -> dict[str, object]:
        # Broker only accepts CNC and IDAY — NRML (carry-overnight for F&O) maps to CNC.
        broker_delivery_type = (
            "ORDER_DELIVERY_TYPE_CNC"
            if order_delivery_type == "ORDER_DELIVERY_TYPE_NRML"
            else order_delivery_type
        )
        return {
            "ref_id": instrument_ref_id,
            "order_type": "ORDER_TYPE_REGULAR",
            "order_qty": order_qty,
            "order_side": order_side,
            "order_delivery_type": broker_delivery_type,
            "validity_type": "IOC",
            "price_type": "LIMIT",
            "order_price": order_price,
            "tag": tag,
            "algo_params": {},
        }

    def _submit_single_order(
        self,
        *,
        session_token: str,
        device_id: str,
        environment: str,
        payload: dict[str, object],
    ) -> dict:
        base_url = self._get_base_url(environment)
        url = f"{base_url}/orders/v2/single"
        self._log.warning("_submit_single_order url=%s payload=%s", url, payload)
        try:
            with httpx.Client(timeout=20.0) as client:
                response = client.post(
                    url,
                    json=payload,
                    headers=self._request_headers(session_token, device_id),
                )
                self._log.warning("_submit_single_order status=%s body=%s", response.status_code, response.text[:500])
                if response.status_code >= 400:
                    try:
                        detail = response.json()
                    except Exception:
                        detail = response.text
                    raise HTTPException(status_code=response.status_code, detail=detail)
                order = response.json()
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Order placement failed: {exc}") from exc
        if not isinstance(order, dict):
            raise HTTPException(status_code=502, detail="Order placement returned an invalid response.")
        return order

    def preview_stock_order(self, request: ScannerOrderPreviewRequest) -> ScannerOrderPreviewResponse:
        if request.ltp_price is None or request.ltp_price <= 0:
            raise HTTPException(status_code=400, detail="A valid live or cached LTP is required before previewing an order.")

        ref_id, lot_size, tick_size = instrument_service.resolve_stock_meta(
            request.session_token,
            request.environment,
            request.device_id,
            request.symbol,
        )
        order_qty = self._normalize_order_qty(lot_size, request.quantity)
        preview_limit_price_paise = self._compute_aggressive_limit_price(
            request.order_side,
            request.ltp_price,
            tick_size,
        )
        preview_limit_price = self._normalize_price_rupees(preview_limit_price_paise) or 0.0
        tag = f"nubraoss_scanner_{request.symbol.strip().lower()}"

        return ScannerOrderPreviewResponse(
            status="success",
            message=(
                f"Preview ready for {'buy' if request.order_side == 'ORDER_SIDE_BUY' else 'sell'} "
                f"{request.instrument_display_name} on {request.environment}."
            ),
            environment=request.environment,
            symbol=request.symbol.strip().upper(),
            instrument_display_name=request.instrument_display_name,
            exchange=request.exchange,
            instrument_ref_id=ref_id,
            order_side=request.order_side,
            requested_qty=request.quantity,
            order_qty=order_qty,
            lot_size=lot_size,
            tick_size=tick_size,
            ltp_price=round(float(request.ltp_price), 2),
            preview_limit_price=preview_limit_price,
            estimated_order_value=round(preview_limit_price * order_qty, 2),
            order_delivery_type=request.order_delivery_type,
            tag=tag,
        )

    def place_stock_order(self, request: ScannerOrderSubmitRequest) -> ScannerOrderSubmitResponse:
        if request.ltp_price is None or request.ltp_price <= 0:
            raise HTTPException(status_code=400, detail="A valid live or cached LTP is required before placing an order.")

        order_qty = self._normalize_order_qty(request.lot_size, request.quantity)
        order_price = self._compute_aggressive_limit_price(
            request.order_side,
            request.ltp_price,
            request.tick_size,
        )
        payload = self._build_single_order_payload(
            instrument_ref_id=request.instrument_ref_id,
            order_qty=order_qty,
            order_side=request.order_side,
            order_delivery_type=request.order_delivery_type,
            order_price=order_price,
            tag=request.tag or f"nubraoss_scanner_{request.symbol.strip().lower()}",
        )
        order = self._submit_single_order(
            session_token=request.session_token,
            device_id=request.device_id,
            environment=request.environment,
            payload=payload,
        )

        return ScannerOrderSubmitResponse(
            status="success",
            message=f"{'Buy' if request.order_side == 'ORDER_SIDE_BUY' else 'Sell'} order sent for {request.instrument_display_name}.",
            order_id=instrument_service._coerce_positive_int(order.get("order_id")),  # noqa: SLF001
            order_status=str(order.get("order_status") or "").strip().upper() or None,
            order_side=request.order_side,
            requested_qty=request.quantity,
            order_qty=order_qty,
            order_price=self._normalize_price_rupees(order.get("order_price")),
            instrument_display_name=request.instrument_display_name,
            symbol=request.symbol.strip().upper(),
            environment=request.environment,
        )

    def place_order(self, request: ScalperOrderRequest) -> ScalperOrderResponse:
        order_qty = max(int(request.lots), 1) * max(int(request.lot_size), 1)
        order_price = self._compute_aggressive_limit_price(
            request.order_side,
            request.ltp_price,
            request.tick_size,
        )
        payload = self._build_single_order_payload(
            instrument_ref_id=request.instrument_ref_id,
            order_qty=order_qty,
            order_side=request.order_side,
            order_delivery_type=request.order_delivery_type,
            order_price=order_price,
            tag=request.tag or f"nubraoss_scalper_{request.option_leg.lower()}",
        )
        order = self._submit_single_order(
            session_token=request.session_token,
            device_id=request.device_id,
            environment=request.environment,
            payload=payload,
        )

        return ScalperOrderResponse(
            status="success",
            message=f"{'Buy' if request.order_side == 'ORDER_SIDE_BUY' else 'Sell'} order sent for {request.instrument_display_name}.",
            order_id=instrument_service._coerce_positive_int(order.get("order_id")),  # noqa: SLF001
            order_status=str(order.get("order_status") or "").strip().upper() or None,
            order_side=request.order_side,
            order_qty=order_qty,
            order_price=self._normalize_price_rupees(order.get("order_price")),
            lots=request.lots,
            instrument_display_name=request.instrument_display_name,
        )

    def expiry_heatmap(self, request: ExpiryHeatmapRequest) -> ExpiryHeatmapResponse:
        option_rows = self._iter_option_rows(
            self._build_scalper_request(
                session_token=request.session_token,
                device_id=request.device_id,
                environment=request.environment,
                underlying=request.underlying,
                exchange=request.exchange,
                interval=request.interval,
                expiry=request.expiry,
            )
        )
        normalized_rows = self._normalize_option_contracts(option_rows, request.expiry)
        if not normalized_rows:
            raise HTTPException(status_code=404, detail="No option contracts matched the selected expiry.")

        delta_request = DeltaNeutralPairsRequest(
            session_token=request.session_token,
            device_id=request.device_id,
            environment=request.environment,
            underlying=request.underlying,
            exchange=request.exchange,
            expiry=request.expiry,
            limit=5,
        )
        spot_price = self._get_underlying_spot(delta_request)

        strikes = sorted({row.strike_price for row in normalized_rows})
        if not strikes:
            raise HTTPException(status_code=404, detail="No valid strikes found for the selected expiry.")

        if spot_price is not None:
            center_strike = min(strikes, key=lambda strike: abs(strike - spot_price))
        else:
            center_strike = strikes[len(strikes) // 2]

        sorted_by_distance = sorted(strikes, key=lambda strike: (abs(strike - center_strike), strike))
        selected_strikes = sorted(sorted_by_distance[: request.limit])
        if not selected_strikes:
            raise HTTPException(status_code=404, detail="No strikes available for the heatmap.")

        calls_by_strike = {row.strike_price: row for row in normalized_rows if row.option_type == "CE"}
        puts_by_strike = {row.strike_price: row for row in normalized_rows if row.option_type == "PE"}
        history_request = self._build_scalper_request(
            session_token=request.session_token,
            device_id=request.device_id,
            environment=request.environment,
            underlying=request.underlying,
            exchange=request.exchange,
            interval=request.interval,
            expiry=request.expiry,
        )

        raw_rows: list[dict] = []
        for strike in selected_strikes:
            call_contract = calls_by_strike.get(strike)
            put_contract = puts_by_strike.get(strike)
            call_metrics = (
                self._latest_option_metrics(request=history_request, instrument=call_contract.display_name)
                if call_contract
                else {"last_price": None, "volume": None, "change_pct": None}
            )
            put_metrics = (
                self._latest_option_metrics(request=history_request, instrument=put_contract.display_name)
                if put_contract
                else {"last_price": None, "volume": None, "change_pct": None}
            )
            raw_rows.append(
                {
                    "strike_price": strike,
                    "expiry": (call_contract.expiry_label if call_contract else None) or (put_contract.expiry_label if put_contract else None),
                    "distance_from_spot": int(round(strike - spot_price)) if spot_price is not None else int(strike - center_strike),
                    "call_display_name": call_contract.display_name if call_contract else None,
                    "put_display_name": put_contract.display_name if put_contract else None,
                    "call_last_price": call_metrics["last_price"],
                    "put_last_price": put_metrics["last_price"],
                    "call_volume": call_metrics["volume"],
                    "put_volume": put_metrics["volume"],
                    "call_change_pct": call_metrics["change_pct"],
                    "put_change_pct": put_metrics["change_pct"],
                }
            )

        max_call_volume = max((float(row["call_volume"]) for row in raw_rows if row["call_volume"] is not None), default=0.0)
        max_put_volume = max((float(row["put_volume"]) for row in raw_rows if row["put_volume"] is not None), default=0.0)
        max_call_change = max((abs(float(row["call_change_pct"])) for row in raw_rows if row["call_change_pct"] is not None), default=0.0)
        max_put_change = max((abs(float(row["put_change_pct"])) for row in raw_rows if row["put_change_pct"] is not None), default=0.0)

        heatmap_rows: list[ExpiryHeatmapRow] = []
        for row in raw_rows:
            call_volume_ratio = (float(row["call_volume"]) / max_call_volume) if row["call_volume"] is not None and max_call_volume > 0 else 0.0
            put_volume_ratio = (float(row["put_volume"]) / max_put_volume) if row["put_volume"] is not None and max_put_volume > 0 else 0.0
            call_change_ratio = (abs(float(row["call_change_pct"])) / max_call_change) if row["call_change_pct"] is not None and max_call_change > 0 else 0.0
            put_change_ratio = (abs(float(row["put_change_pct"])) / max_put_change) if row["put_change_pct"] is not None and max_put_change > 0 else 0.0
            call_heat = round(((call_volume_ratio * 0.75) + (call_change_ratio * 0.25)) * 100.0, 1)
            put_heat = round(((put_volume_ratio * 0.75) + (put_change_ratio * 0.25)) * 100.0, 1)

            heatmap_rows.append(
                ExpiryHeatmapRow(
                    strike_price=int(row["strike_price"]),
                    expiry=row["expiry"],
                    distance_from_spot=int(row["distance_from_spot"]),
                    call_display_name=row["call_display_name"],
                    put_display_name=row["put_display_name"],
                    call_last_price=float(row["call_last_price"]) if row["call_last_price"] is not None else None,
                    put_last_price=float(row["put_last_price"]) if row["put_last_price"] is not None else None,
                    call_volume=float(row["call_volume"]) if row["call_volume"] is not None else None,
                    put_volume=float(row["put_volume"]) if row["put_volume"] is not None else None,
                    call_change_pct=float(row["call_change_pct"]) if row["call_change_pct"] is not None else None,
                    put_change_pct=float(row["put_change_pct"]) if row["put_change_pct"] is not None else None,
                    call_heat=call_heat,
                    put_heat=put_heat,
                )
            )

        resolved_expiry = next((row.expiry for row in heatmap_rows if row.expiry), None)
        return ExpiryHeatmapResponse(
            status="success",
            message="Expiry heatmap loaded from the latest available Nubra option snapshots.",
            underlying=request.underlying,
            exchange=request.exchange,
            expiry=resolved_expiry,
            interval=request.interval,
            spot_price=spot_price,
            center_strike=center_strike,
            rows=heatmap_rows,
        )

    def _build_panel(
        self,
        *,
        request: ScalperSnapshotRequest,
        instrument: str,
        display_name: str,
        instrument_type: str,
    ) -> ScalperChartPanel:
        frame = self._fetch_latest_history_frame(
            request=request,
            instrument=instrument,
            instrument_type=instrument_type,
        )
        if frame is None or frame.empty:
            raise HTTPException(status_code=404, detail=f"No chart data returned for {display_name}, even after checking recent trading sessions.")

        candles = [
            ScalperCandle(
                time_ist=timestamp.strftime("%d %b %H:%M"),
                epoch_ms=int(timestamp.timestamp() * 1000),
                open=float(row["open"]),
                high=float(row["high"]),
                low=float(row["low"]),
                close=float(row["close"]),
                volume=float(row["bucket_volume"]) if row.get("bucket_volume") is not None else None,
            )
            for timestamp, row in frame.tail(260).iterrows()
        ]
        last_price = candles[-1].close if candles else None
        return ScalperChartPanel(
            instrument=instrument,
            display_name=display_name,
            exchange=request.exchange,
            instrument_type=instrument_type,
            interval=request.interval,
            last_price=last_price,
            candles=candles,
        )

    def _build_panel_with_frame(
        self,
        *,
        request: ScalperSnapshotRequest,
        instrument: str,
        display_name: str,
        instrument_type: str,
        frame,
    ) -> ScalperChartPanel:
        """Build a chart panel from a pre-fetched DataFrame (used for cached underlying)."""
        if frame is None or (hasattr(frame, 'empty') and frame.empty):
            raise HTTPException(status_code=404, detail=f"No chart data returned for {display_name}.")

        candles = [
            ScalperCandle(
                time_ist=timestamp.strftime("%d %b %H:%M"),
                epoch_ms=int(timestamp.timestamp() * 1000),
                open=float(row["open"]),
                high=float(row["high"]),
                low=float(row["low"]),
                close=float(row["close"]),
                volume=float(row["bucket_volume"]) if row.get("bucket_volume") is not None else None,
            )
            for timestamp, row in frame.tail(150).iterrows()
        ]
        last_price = candles[-1].close if candles else None
        return ScalperChartPanel(
            instrument=instrument,
            display_name=display_name,
            exchange=request.exchange,
            instrument_type=instrument_type,
            interval=request.interval,
            last_price=last_price,
            candles=candles,
        )

    def _build_option_panels_batched(
        self,
        *,
        request: ScalperSnapshotRequest,
        call_symbol: str,
        put_symbol: str,
    ) -> tuple[ScalperChartPanel, ScalperChartPanel]:
        """Fetch CE + PE candles in a SINGLE API call and build both panels."""
        lookback_span = timedelta(days=max(request.lookback_days + 2, 7))
        end_dt = self._last_trading_close(datetime.now(IST))
        call_frame = None
        put_frame = None

        for _ in range(3):
            start_dt = end_dt - lookback_span
            frames = market_history_service.fetch(
                HistoricalFetchRequest(
                    session_token=request.session_token,
                    device_id=request.device_id,
                    environment=request.environment,
                    exchange=request.exchange,
                    instrument_type="OPT",
                    interval=request.interval,
                    symbols=(call_symbol, put_symbol),
                    start_dt=start_dt,
                    end_dt=end_dt,
                )
            )
            call_frame = call_frame or frames.get(call_symbol.upper())
            put_frame = put_frame or frames.get(put_symbol.upper())
            if (call_frame is not None and not call_frame.empty) and (put_frame is not None and not put_frame.empty):
                break
            end_dt = self._last_trading_close(end_dt - timedelta(days=1))

        if call_frame is None or call_frame.empty:
            raise HTTPException(status_code=404, detail=f"No chart data for {call_symbol}.")
        if put_frame is None or put_frame.empty:
            raise HTTPException(status_code=404, detail=f"No chart data for {put_symbol}.")

        def _frame_to_panel(frame, symbol):
            candles = [
                ScalperCandle(
                    time_ist=ts.strftime("%d %b %H:%M"),
                    epoch_ms=int(ts.timestamp() * 1000),
                    open=float(r["open"]),
                    high=float(r["high"]),
                    low=float(r["low"]),
                    close=float(r["close"]),
                    volume=float(r["bucket_volume"]) if r.get("bucket_volume") is not None else None,
                )
                for ts, r in frame.tail(150).iterrows()
            ]
            return ScalperChartPanel(
                instrument=symbol,
                display_name=symbol,
                exchange=request.exchange,
                instrument_type="OPT",
                interval=request.interval,
                last_price=candles[-1].close if candles else None,
                candles=candles,
            )

        return _frame_to_panel(call_frame, call_symbol), _frame_to_panel(put_frame, put_symbol)

    def snapshot(self, request: ScalperSnapshotRequest) -> ScalperSnapshotResponse:
        underlying = self._normalize_underlying(request.underlying)

        # Determine instrument type: indices have a fixed exchange mapping;
        # stocks/ETFs are passed through as-is with the exchange from the request.
        if underlying in INDEX_UNDERLYINGS:
            default_exchange, underlying_type = INDEX_UNDERLYINGS[underlying]
            if request.exchange != default_exchange:
                raise HTTPException(
                    status_code=400,
                    detail=f"{underlying} is available on {default_exchange} for the current scalper view.",
                )
        else:
            # Stock / ETF underlying — accept whatever exchange the client sent
            underlying_type = "STOCK"

        underlying_frame = self._fetch_underlying_cached(
            request=request,
            instrument=underlying,
            instrument_type=underlying_type,
        )
        underlying_spot = self._get_scalper_snapshot_spot(request)
        if underlying_spot is None and underlying_frame is not None and not underlying_frame.empty:
            latest_close = self._coerce_float(underlying_frame.iloc[-1].get("close"))
            underlying_spot = latest_close

        call_contract, put_contract = self._resolve_option_pair(request, spot_price=underlying_spot)

        underlying_panel = self._build_panel_with_frame(
            request=request,
            instrument=underlying,
            display_name=underlying,
            instrument_type=underlying_type,
            frame=underlying_frame,
        )
        call_panel, put_panel = self._build_option_panels_batched(
            request=request,
            call_symbol=call_contract.display_name,
            put_symbol=put_contract.display_name,
        )

        option_pair = ScalperResolvedOptionPair(
            underlying=underlying,
            exchange=request.exchange,
            expiry=call_contract.expiry_label or put_contract.expiry_label,
            ce_strike_price=call_contract.strike_price,
            pe_strike_price=put_contract.strike_price,
            call_ref_id=call_contract.ref_id,
            put_ref_id=put_contract.ref_id,
            call_display_name=call_contract.display_name,
            put_display_name=put_contract.display_name,
            lot_size=call_contract.lot_size or put_contract.lot_size,
            tick_size=call_contract.tick_size or put_contract.tick_size,
        )
        return ScalperSnapshotResponse(
            status="success",
            message="Scalper snapshot loaded from Nubra historical data.",
            underlying=underlying_panel,
            call_option=call_panel,
            put_option=put_panel,
            option_pair=option_pair,
        )


    # ── Options mode endpoints ────────────────────────────────────────────────

    def option_chain_for_positioning(
        self,
        request: "PositioningOptionChainRequest",
    ) -> "PositioningOptionChainResponse":
        from app.schemas import (
            OptionChainStrikeRow,
            PositioningOptionChainResponse,
        )

        exchange = "BSE" if request.underlying.upper() in ("SENSEX", "BANKEX") else "NSE"
        delta_req = DeltaNeutralPairsRequest(
            session_token=request.session_token,
            device_id=request.device_id,
            environment=request.environment,
            underlying=request.underlying.upper(),
            exchange=exchange,
            expiry=request.expiry,
            limit=5,
        )

        spot_price = self._get_underlying_spot(delta_req)

        from datetime import datetime as _dt
        _now_ist = _dt.now(IST)
        _hm = _now_ist.hour * 60 + _now_ist.minute
        _market_closed = _now_ist.weekday() >= 5 or _hm < 9 * 60 + 15 or _hm >= 15 * 60 + 30

        payload = self._get_option_chain_snapshot(delta_req)
        if not payload:
            return PositioningOptionChainResponse(
                underlying=request.underlying.upper(),
                spot_price=spot_price,
                atm_strike=None,
                expiry=None,
                pcr=None,
                max_pain=None,
                straddle_price=None,
                total_ce_oi=None,
                total_pe_oi=None,
                strikes=[],
                fetched_at=_dt.now().isoformat(),
                market_closed=_market_closed,
            )

        # Unwrap common broker envelope shapes
        inner = payload
        for envelope_key in ("data", "chain", "optionchain", "optionChain", "chainData", "result", "response"):
            candidate = payload.get(envelope_key)
            if isinstance(candidate, dict) and (
                candidate.get("ce") or candidate.get("CE")
                or candidate.get("calls") or candidate.get("callOptions")
            ):
                inner = candidate
                break

        expiry_label = str(inner.get("expiry") or payload.get("expiry") or "").strip() or None

        def _pick_rows(d: dict, ce_keys: tuple, pe_keys: tuple) -> tuple[list, list]:
            for ck in ce_keys:
                v = d.get(ck)
                if isinstance(v, list) and v:
                    for pk in pe_keys:
                        pv = d.get(pk)
                        if isinstance(pv, list) and pv:
                            return v, pv
            return [], []

        ce_rows, pe_rows = _pick_rows(
            inner,
            ce_keys=("ce", "CE", "calls", "call", "callOptions"),
            pe_keys=("pe", "PE", "puts", "put", "putOptions"),
        )

        # Fallback: flat list with option_type / type field
        if not ce_rows and not pe_rows:
            flat = inner.get("strikes") or inner.get("chain") or inner.get("options") or []
            if isinstance(flat, list):
                for row in flat:
                    if not isinstance(row, dict):
                        continue
                    ot = str(row.get("option_type") or row.get("optionType") or row.get("type") or "").strip().upper()
                    if ot == "CE":
                        ce_rows.append(row)
                    elif ot == "PE":
                        pe_rows.append(row)

        self._log.warning(
            "option_chain_for_positioning %s: inner_keys=%s ce_rows=%d pe_rows=%d",
            request.underlying, list(inner.keys()), len(ce_rows), len(pe_rows),
        )

        def _paise(raw: object) -> float | None:
            v = self._coerce_float(raw)
            return round(v / 100.0, 2) if v is not None else None

        def _extract(row: dict) -> tuple[int | None, dict]:
            strike = self._normalize_row_strike(
                row.get("sp") if row.get("sp") is not None else row.get("strike_price")
            )
            ltp_raw = row.get("ltp") or row.get("last_price") or row.get("lastPrice")
            ref_id = instrument_service._coerce_positive_int(  # noqa: SLF001
                row.get("ref_id") or row.get("refId") or row.get("token") or row.get("instrument_token")
            )
            lot_size_raw = row.get("ls") or row.get("lot_size") or row.get("lotSize")
            return strike, {
                "ref_id": ref_id,
                "oi": self._coerce_float(row.get("oi") or row.get("open_interest") or row.get("openInterest")),
                "oi_change": self._coerce_float(row.get("oi_change") or row.get("change_in_oi") or row.get("changeInOI")),
                "iv": self._coerce_float(row.get("iv") or row.get("implied_volatility") or row.get("impliedVolatility")),
                "ltp": _paise(ltp_raw),
                "delta": self._coerce_float(row.get("delta")),
                "gamma": self._coerce_float(row.get("gamma")),
                "theta": self._coerce_float(row.get("theta")),
                "vega": self._coerce_float(row.get("vega")),
                "volume": self._coerce_float(row.get("volume") or row.get("vol")),
                "lot_size": int(lot_size_raw) if lot_size_raw else None,
            }

        ce_by_strike: dict[int, dict] = {}
        for row in (ce_rows if isinstance(ce_rows, list) else []):
            s, d = _extract(row)
            if s is not None:
                ce_by_strike[s] = d

        pe_by_strike: dict[int, dict] = {}
        for row in (pe_rows if isinstance(pe_rows, list) else []):
            s, d = _extract(row)
            if s is not None:
                pe_by_strike[s] = d

        all_strikes = sorted(set(ce_by_strike) | set(pe_by_strike))
        if not all_strikes:
            return PositioningOptionChainResponse(
                underlying=request.underlying.upper(),
                spot_price=spot_price,
                atm_strike=None,
                expiry=expiry_label,
                pcr=None,
                max_pain=None,
                straddle_price=None,
                total_ce_oi=None,
                total_pe_oi=None,
                strikes=[],
                fetched_at=_dt.now().isoformat(),
                market_closed=_market_closed,
            )

        ref = spot_price if spot_price else all_strikes[len(all_strikes) // 2]
        atm_strike = min(all_strikes, key=lambda s: abs(s - ref))
        atm_idx = all_strikes.index(atm_strike)
        lo = max(0, atm_idx - 15)
        hi = min(len(all_strikes), atm_idx + 16)
        selected = all_strikes[lo:hi]

        total_ce_oi = 0.0
        total_pe_oi = 0.0
        chain_lot_size: int = 1
        strike_rows: list[OptionChainStrikeRow] = []

        for strike in selected:
            ce = ce_by_strike.get(strike, {})
            pe = pe_by_strike.get(strike, {})
            if ce.get("oi"):
                total_ce_oi += ce["oi"]
            if pe.get("oi"):
                total_pe_oi += pe["oi"]
            # Capture lot_size from first row that carries it
            if chain_lot_size == 1:
                ls = ce.get("lot_size") or pe.get("lot_size")
                if ls and isinstance(ls, int) and ls > 1:
                    chain_lot_size = ls
            strike_rows.append(OptionChainStrikeRow(
                strike_price=strike,
                distance_from_spot=int(round(strike - (spot_price or atm_strike))),
                is_atm=(strike == atm_strike),
                ce_ref_id=ce.get("ref_id"),
                ce_oi=ce.get("oi"),
                ce_oi_change=ce.get("oi_change"),
                ce_iv=ce.get("iv"),
                ce_ltp=ce.get("ltp"),
                ce_delta=abs(ce["delta"]) if ce.get("delta") is not None else None,
                ce_gamma=ce.get("gamma"),
                ce_theta=ce.get("theta"),
                ce_vega=ce.get("vega"),
                ce_volume=ce.get("volume"),
                pe_ref_id=pe.get("ref_id"),
                pe_oi=pe.get("oi"),
                pe_oi_change=pe.get("oi_change"),
                pe_iv=pe.get("iv"),
                pe_ltp=pe.get("ltp"),
                pe_delta=abs(pe["delta"]) if pe.get("delta") is not None else None,
                pe_gamma=pe.get("gamma"),
                pe_theta=pe.get("theta"),
                pe_vega=pe.get("vega"),
                pe_volume=pe.get("volume"),
            ))

        pcr = round(total_pe_oi / total_ce_oi, 3) if total_ce_oi > 0 else None

        # Max pain: strike where combined OI writer loss is minimised
        max_pain: int | None = None
        if any(r.ce_oi or r.pe_oi for r in strike_rows):
            min_pain = float("inf")
            for candidate in selected:
                pain = sum(
                    (candidate - r.strike_price) * (r.ce_oi or 0) if candidate > r.strike_price else 0
                    for r in strike_rows
                ) + sum(
                    (r.strike_price - candidate) * (r.pe_oi or 0) if candidate < r.strike_price else 0
                    for r in strike_rows
                )
                if pain < min_pain:
                    min_pain = pain
                    max_pain = candidate

        atm_ce = ce_by_strike.get(atm_strike, {})
        atm_pe = pe_by_strike.get(atm_strike, {})
        straddle: float | None = None
        if atm_ce.get("ltp") is not None and atm_pe.get("ltp") is not None:
            straddle = round(float(atm_ce["ltp"]) + float(atm_pe["ltp"]), 2)

        return PositioningOptionChainResponse(
            underlying=request.underlying.upper(),
            spot_price=spot_price,
            atm_strike=atm_strike,
            expiry=expiry_label,
            pcr=pcr,
            max_pain=max_pain,
            straddle_price=straddle,
            total_ce_oi=total_ce_oi if total_ce_oi > 0 else None,
            total_pe_oi=total_pe_oi if total_pe_oi > 0 else None,
            strikes=strike_rows,
            fetched_at=_dt.now().isoformat(),
            market_closed=_market_closed,
            lot_size=chain_lot_size,
        )

    def index_candles_for_positioning(
        self,
        request: "PositioningIndexCandlesRequest",
    ) -> "PositioningIndexCandlesResponse":
        from app.schemas import PositioningIndexCandlesResponse, VolumeBreakoutDrilldownPoint
        from datetime import datetime as _dt, timedelta as _td, timezone as _tz

        _IST = _tz(_td(hours=5, minutes=30))
        now_ist = _dt.now(tz=_IST)
        underlying = request.underlying.strip().upper()
        exchange = "BSE" if underlying in ("SENSEX", "BANKEX") else "NSE"
        symbol_aliases = INDEX_HISTORY_SYMBOL_ALIASES.get(underlying, (underlying,))

        # Walk back up to 5 calendar days to find the last session with data.
        # Skips weekends; returns the first non-empty session found.
        frames: dict = {}
        session_date_ist: _dt | None = None
        last_fetch_error: str | None = None
        days_checked = 0
        offset = 0
        while days_checked < 5:
            candidate = now_ist - _td(days=offset)
            offset += 1
            if candidate.weekday() >= 5:  # skip Sat/Sun
                continue
            days_checked += 1
            session_start = candidate.replace(hour=9, minute=0, second=0, microsecond=0).astimezone(_tz.utc)
            session_end = candidate.replace(hour=15, minute=31, second=0, microsecond=0).astimezone(_tz.utc)
            # For the current day, end at now rather than 15:31 so we get live partial session
            if candidate.date() == now_ist.date():
                session_end = _dt.now(_tz.utc)
            for alias in symbol_aliases:
                try:
                    frames = market_history_service.fetch(
                        HistoricalFetchRequest(
                            session_token=request.session_token,
                            device_id=request.device_id,
                            environment=request.environment,
                            symbols=(alias,),
                            exchange=exchange,
                            instrument_type="INDEX",
                            interval="1m",
                            start_dt=session_start,
                            end_dt=session_end,
                        )
                    )
                except Exception as _exc:
                    import logging as _log
                    _log.getLogger(__name__).warning(
                        "index_candles fetch failed for %s (%s %s): %s",
                        alias, exchange, candidate.date(), _exc,
                    )
                    last_fetch_error = str(_exc)
                    frames = {}
                if frames:
                    break
            if frames:
                session_date_ist = candidate
                break

        frame = next(iter(frames.values()), None)
        points: list[VolumeBreakoutDrilldownPoint] = []
        if frame is not None and not frame.empty:
            for ts, row in frame.iterrows():
                epoch_ms = int(ts.timestamp() * 1000)
                time_ist = ts.strftime("%Y-%m-%dT%H:%M:%S+05:30")
                points.append(VolumeBreakoutDrilldownPoint(
                    time_ist=time_ist,
                    epoch_ms=epoch_ms,
                    open=float(row["open"]) if "open" in row and row["open"] == row["open"] else None,
                    high=float(row["high"]) if "high" in row and row["high"] == row["high"] else None,
                    low=float(row["low"]) if "low" in row and row["low"] == row["low"] else None,
                    close=float(row["close"]) if row["close"] == row["close"] else 0.0,
                    volume=float(row.get("bucket_volume") or 0),
                ))

        today_str = now_ist.strftime("%Y-%m-%d")
        is_stale = session_date_ist is not None and session_date_ist.strftime("%Y-%m-%d") != today_str
        session_label = session_date_ist.strftime("%d %b %Y") if session_date_ist else None
        return PositioningIndexCandlesResponse(
            underlying=underlying,
            points=points,
            is_stale=is_stale,
            session_date=session_label,
            fetch_error=last_fetch_error if not points else None,
        )

    def option_candles_for_positioning(
        self,
        request: "PositioningOptionCandlesRequest",
    ) -> "PositioningIndexCandlesResponse":
        from app.schemas import PositioningIndexCandlesResponse, VolumeBreakoutDrilldownPoint
        from app.services.instrument_service import instrument_service
        from datetime import datetime as _dt, timedelta as _td, timezone as _tz
        import logging as _log

        _IST = _tz(_td(hours=5, minutes=30))
        now_ist = _dt.now(tz=_IST)
        underlying = request.underlying.strip().upper()
        strike_target = int(round(float(request.strike_price)))
        option_type = request.option_type.strip().upper()

        # Resolve the option's chart symbol via refdata
        chart_symbol: str | None = None
        resolve_error: str | None = None
        try:
            _ref_id, _lot, _tick, display_name, _exchange = instrument_service.resolve_option_meta(
                request.session_token,
                request.environment,
                request.device_id,
                underlying,
                request.strike_price,
                option_type,
                request.expiry,
            )
            chart_symbol = display_name
        except Exception as _exc:
            resolve_error = str(_exc)
            _log.getLogger(__name__).warning(
                "option_candles_for_positioning: refdata resolve failed for %s %s %s: %s",
                underlying, strike_target, option_type, _exc,
            )
            # Fallback: construct a best-guess symbol
            chart_symbol = f"{underlying}{strike_target}{option_type}"

        frames: dict = {}
        session_date_ist: _dt | None = None
        last_fetch_error: str | None = resolve_error
        days_checked = 0
        offset = 0
        while days_checked < 5:
            candidate = now_ist - _td(days=offset)
            offset += 1
            if candidate.weekday() >= 5:
                continue
            days_checked += 1
            session_start = candidate.replace(hour=9, minute=0, second=0, microsecond=0).astimezone(_tz.utc)
            session_end = candidate.replace(hour=15, minute=31, second=0, microsecond=0).astimezone(_tz.utc)
            if candidate.date() == now_ist.date():
                session_end = _dt.now(_tz.utc)
            for itype in ("OPT", "FNO", "STOCK"):
                try:
                    frames = market_history_service.fetch(
                        HistoricalFetchRequest(
                            session_token=request.session_token,
                            device_id=request.device_id,
                            environment=request.environment,
                            symbols=(chart_symbol,),
                            exchange="NSE",
                            instrument_type=itype,
                            interval="1m",
                            start_dt=session_start,
                            end_dt=session_end,
                        )
                    )
                except Exception as _exc:
                    _log.getLogger(__name__).warning(
                        "option_candles fetch failed %s itype=%s: %s", chart_symbol, itype, _exc,
                    )
                    last_fetch_error = str(_exc)
                    frames = {}
                if frames:
                    break
            if frames:
                session_date_ist = candidate
                break

        frame = next(iter(frames.values()), None)
        points: list[VolumeBreakoutDrilldownPoint] = []
        if frame is not None and not frame.empty:
            for ts, row in frame.iterrows():
                epoch_ms = int(ts.timestamp() * 1000)
                time_ist = ts.strftime("%Y-%m-%dT%H:%M:%S+05:30")
                points.append(VolumeBreakoutDrilldownPoint(
                    time_ist=time_ist,
                    epoch_ms=epoch_ms,
                    open=float(row["open"]) if "open" in row and row["open"] == row["open"] else None,
                    high=float(row["high"]) if "high" in row and row["high"] == row["high"] else None,
                    low=float(row["low"]) if "low" in row and row["low"] == row["low"] else None,
                    close=float(row["close"]) if row["close"] == row["close"] else 0.0,
                    volume=float(row.get("bucket_volume") or 0),
                ))

        today_str = now_ist.strftime("%Y-%m-%d")
        is_stale = session_date_ist is not None and session_date_ist.strftime("%Y-%m-%d") != today_str
        session_label = session_date_ist.strftime("%d %b %Y") if session_date_ist else None
        return PositioningIndexCandlesResponse(
            underlying=f"{underlying} {strike_target} {option_type}",
            points=points,
            is_stale=is_stale,
            session_date=session_label,
            fetch_error=last_fetch_error if not points else None,
        )

    async def intraday_bootstrap_for_positioning(
        self,
        request: "PositioningIntradayBootstrapRequest",
    ) -> "PositioningIntradayBootstrapResponse":
        """Fetch today's 1m bars for the scanner universe and seed partial_scan_rows.

        This pre-warms the positioning engines with real market data immediately
        on session start, before the live scanner finishes its first hydration cycle.
        """
        from app.schemas import PositioningIntradayBootstrapResponse, VolumeBreakoutDrilldownPoint
        from app.schemas import VolumeBreakoutStockRow
        from app.services.volume_breakout_service import volume_breakout_service
        import time as _time
        from datetime import datetime as _dt, timezone as _tz

        t0 = _time.monotonic()
        _IST = ZoneInfo("Asia/Kolkata")
        now_ist = _dt.now(tz=_IST)
        session_date = now_ist.date()
        today_str = session_date.isoformat()

        # Get the current scanner universe for symbol + sector/industry metadata
        universe_meta = volume_breakout_service.get_universe_meta(limit=request.max_symbols)
        if not universe_meta:
            return PositioningIntradayBootstrapResponse(
                injected=0,
                total_fetched=0,
                symbols_attempted=0,
                duration_ms=0,
                session_date=today_str,
            )

        all_syms = [r["symbol"] for r in universe_meta]
        meta_by_sym = {r["symbol"]: r for r in universe_meta}
        session_start = _dt(
            session_date.year, session_date.month, session_date.day,
            9, 0, 0, tzinfo=_IST,
        ).astimezone(_tz.utc)
        session_end = _dt.now(_tz.utc)

        # Batch symbols into groups of 10 and fetch concurrently
        batches = [all_syms[i: i + 10] for i in range(0, len(all_syms), 10)]

        def _fetch_batch(symbols: list[str]) -> dict[str, pd.DataFrame]:
            try:
                return market_history_service.fetch(
                    HistoricalFetchRequest(
                        session_token=request.session_token,
                        device_id=request.device_id,
                        environment=request.environment,
                        symbols=tuple(symbols),
                        exchange="NSE",
                        instrument_type="STOCK",
                        interval="1m",
                        start_dt=session_start,
                        end_dt=session_end,
                    )
                )
            except Exception as exc:
                log.debug("intraday_bootstrap.batch_failed symbols=%s error=%s", symbols, exc)
                return {}

        loop = asyncio.get_event_loop()
        with ThreadPoolExecutor(max_workers=8) as pool:
            batch_results = await asyncio.gather(
                *[loop.run_in_executor(pool, _fetch_batch, batch) for batch in batches]
            )

        all_frames: dict[str, pd.DataFrame] = {}
        for result in batch_results:
            all_frames.update(result)

        # Build VolumeBreakoutStockRow from each symbol's candle data
        bootstrap_rows: list[VolumeBreakoutStockRow] = []
        for sym, frame in all_frames.items():
            if frame.empty:
                continue
            meta = meta_by_sym.get(sym, {})
            # Filter to today's session
            try:
                session_mask = frame["session_date"].apply(lambda d: d.isoformat() if hasattr(d, "isoformat") else str(d)) == today_str
                session_frame = frame[session_mask]
            except Exception:
                session_frame = frame
            if session_frame.empty:
                continue

            first_row = session_frame.iloc[0]
            latest_row = session_frame.iloc[-1]
            latest_ts = session_frame.index[-1]

            day_open = float(first_row["open"]) if pd.notna(first_row.get("open")) else 0.0
            current_close = float(latest_row["close"]) if pd.notna(latest_row.get("close")) else 0.0
            if day_open <= 0 or current_close <= 0:
                continue

            day_change_pct = (current_close - day_open) / day_open * 100.0
            is_green = current_close >= day_open
            # Use bucket volume of latest candle; fall back to cumulative / n_candles
            bucket_vol = float(latest_row.get("bucket_volume", 0) or 0)
            cum_vol = float(latest_row.get("cumulative_volume", 0) or 0)
            current_volume = bucket_vol if bucket_vol > 0 else (cum_vol / max(1, len(session_frame)))
            if current_volume <= 0:
                continue

            candle_time_ist = latest_ts.strftime("%Y-%m-%d %H:%M:%S %Z")

            bootstrap_rows.append(
                VolumeBreakoutStockRow(
                    symbol=sym,
                    display_name=str(meta.get("display_name") or sym),
                    exchange=str(meta.get("exchange") or "NSE"),
                    sector=meta.get("sector"),
                    industry=meta.get("industry"),
                    candle_time_ist=candle_time_ist,
                    last_price=round(current_close, 2),
                    current_volume=round(current_volume, 2),
                    average_volume=round(current_volume, 2),  # neutral ratio
                    volume_ratio=1.0,
                    price_change_pct=round(day_change_pct, 2),
                    day_change_pct=round(day_change_pct, 2),
                    price_breakout_pct=None,
                    is_green=is_green,
                    is_price_breakout=False,
                    meets_breakout=False,
                    baseline_days=0,
                )
            )

        injected = volume_breakout_service.inject_bootstrap_rows(bootstrap_rows)
        duration_ms = int((_time.monotonic() - t0) * 1000)
        log.info(
            "intraday_bootstrap.done fetched=%s built=%s injected=%s duration_ms=%s",
            len(all_frames),
            len(bootstrap_rows),
            injected,
            duration_ms,
        )
        return PositioningIntradayBootstrapResponse(
            injected=injected,
            total_fetched=len(all_frames),
            symbols_attempted=len(all_syms),
            duration_ms=duration_ms,
            session_date=today_str,
        )


    def preview_option_order(
        self,
        request: "PositioningOptionOrderPreviewRequest",
    ) -> "PositioningOptionOrderPreviewResponse":
        from app.schemas import PositioningOptionOrderPreviewResponse

        ref_id, lot_size, tick_size, display_name, _exchange = instrument_service.resolve_option_meta(
            request.session_token,
            request.environment,
            request.device_id,
            request.underlying,
            request.strike_price,
            request.option_type,
            expiry_hint=request.expiry,
        )

        order_qty = max(int(request.lots), 1) * max(lot_size, 1)
        order_price_paise = self._compute_aggressive_limit_price(
            request.order_side,
            request.ltp_price,
            tick_size,
        )
        preview_limit_price = self._normalize_price_rupees(order_price_paise) or round(float(request.ltp_price), 2)
        tag = f"nubraoss_options_{request.underlying.strip().lower()}_{int(request.strike_price)}{request.option_type.lower()}"

        return PositioningOptionOrderPreviewResponse(
            status="success",
            environment=request.environment,
            underlying=request.underlying.strip().upper(),
            strike_price=request.strike_price,
            option_type=request.option_type,
            expiry=request.expiry,
            instrument_ref_id=ref_id,
            instrument_display_name=display_name,
            lot_size=lot_size,
            tick_size=tick_size,
            lots=request.lots,
            order_qty=order_qty,
            ltp_price=round(float(request.ltp_price), 2),
            preview_limit_price=preview_limit_price,
            estimated_order_value=round(preview_limit_price * order_qty, 2),
            order_side=request.order_side,
            order_delivery_type=request.order_delivery_type,
            tag=tag,
        )

    def get_positions_for_positioning(
        self,
        request: "PositioningPositionsRequest",
    ) -> "PositioningPositionsResponse":
        from app.schemas import PositioningPositionItem, PositioningPositionsResponse

        base_url = self._get_base_url(request.environment)
        try:
            with httpx.Client(timeout=20.0) as client:
                response = client.get(
                    f"{base_url}/portfolio/positions",
                    headers=self._request_headers(request.session_token, request.device_id),
                )
                if response.status_code == 404:
                    return PositioningPositionsResponse(positions=[], total_pnl=0.0)
                if response.status_code >= 400:
                    raise HTTPException(status_code=response.status_code, detail=response.text)
                payload = response.json()
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Failed to fetch positions: {exc}") from exc

        portfolio = payload.get("portfolio", {}) if isinstance(payload, dict) else {}
        raw_positions: list[dict] = []
        for key in ("opt_positions", "fut_positions"):
            bucket = portfolio.get(key) or []
            if isinstance(bucket, list):
                raw_positions.extend(bucket)

        def _paise(v: object) -> float:
            val = self._coerce_float(v)
            return round(val / 100.0, 2) if val is not None else 0.0

        positions: list[PositioningPositionItem] = []
        for pos in raw_positions:
            if not isinstance(pos, dict):
                continue
            ref_id = instrument_service._coerce_positive_int(pos.get("ref_id"))  # noqa: SLF001
            if ref_id is None:
                continue
            qty = int(self._coerce_float(pos.get("qty")) or 0)
            if qty == 0:
                continue

            # Parse option type from display_name
            display = str(pos.get("display_name") or pos.get("symbol") or "")
            upper = display.upper()
            opt_type: str | None = "CE" if upper.endswith("CE") else ("PE" if upper.endswith("PE") else None)

            # Strike from raw value (paise × 100 in some envs)
            strike_raw = pos.get("strike_price")
            strike: float | None = None
            if strike_raw:
                sv = self._coerce_float(strike_raw)
                if sv and sv > 0:
                    strike = round(sv / 100.0, 2) if sv >= 100000 else sv

            # Parse expiry from zanskar_name e.g. OPT_NIFTY_20250814_PE_2445000
            zanskar = str(pos.get("zanskar_name") or "")
            expiry: str | None = None
            parts = zanskar.split("_")
            if len(parts) >= 3:
                candidate = parts[2]
                if candidate.isdigit() and len(candidate) == 8:
                    expiry = candidate

            positions.append(PositioningPositionItem(
                ref_id=ref_id,
                display_name=display,
                underlying=str(pos.get("asset") or ""),
                strike_price=strike,
                option_type=opt_type,
                lot_size=int(instrument_service._coerce_positive_int(pos.get("lot_size"), 1) or 1),  # noqa: SLF001
                qty=qty,
                avg_price=_paise(pos.get("avg_price") or pos.get("avg_buy_price") or pos.get("avg_sell_price")),
                ltp=_paise(pos.get("ltp")),
                pnl=_paise(pos.get("pnl")),
                pnl_pct=self._coerce_float(pos.get("pnl_chg")),
                product=str(pos.get("product") or ""),
                side=str(pos.get("order_side") or "BUY"),
                expiry=expiry,
                zanskar_name=zanskar or None,
            ))

        return PositioningPositionsResponse(
            positions=positions,
            total_pnl=round(sum(p.pnl for p in positions), 2),
        )

    def get_orders_for_positioning(
        self,
        request: "PositioningOrdersRequest",
    ) -> "PositioningOrdersResponse":
        from app.schemas import PositioningOrderItem, PositioningOrdersResponse

        base_url = self._get_base_url(request.environment)
        try:
            with httpx.Client(timeout=20.0) as client:
                response = client.get(
                    f"{base_url}/orders/v2",
                    headers=self._request_headers(request.session_token, request.device_id),
                )
                if response.status_code == 404:
                    return PositioningOrdersResponse(orders=[])
                if response.status_code >= 400:
                    raise HTTPException(status_code=response.status_code, detail=response.text)
                raw = response.json()
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Failed to fetch orders: {exc}") from exc

        orders_list = raw if isinstance(raw, list) else (raw.get("orders") or [] if isinstance(raw, dict) else [])
        orders: list[PositioningOrderItem] = []
        for o in orders_list:
            if not isinstance(o, dict):
                continue
            tag = str(o.get("tag") or "")
            if not tag.startswith("nubraoss_options_"):
                continue
            order_id = instrument_service._coerce_positive_int(o.get("order_id"))  # noqa: SLF001
            ref_id = instrument_service._coerce_positive_int(o.get("ref_id"))  # noqa: SLF001
            if order_id is None or ref_id is None:
                continue
            price_raw = self._coerce_float(o.get("order_price") or 0)
            price_rupees = round((price_raw or 0) / 100.0, 2) if (price_raw or 0) > 100 else (price_raw or 0)
            orders.append(PositioningOrderItem(
                order_id=order_id,
                ref_id=ref_id,
                display_name=str(o.get("display_name") or ""),
                order_side=str(o.get("order_side") or ""),
                order_status=str(o.get("order_status") or ""),
                order_price=price_rupees,
                order_qty=int(self._coerce_float(o.get("order_qty")) or 0),
                order_delivery_type=str(o.get("order_delivery_type") or ""),
                tag=tag or None,
                order_time=int(o["order_time"]) if o.get("order_time") else None,
            ))

        return PositioningOrdersResponse(orders=orders)

    def exit_position(
        self,
        request: "PositioningExitRequest",
    ) -> "PositioningExitResponse":
        from app.schemas import PositioningExitResponse

        # Tick size: look up from refdata, fallback to 5 (standard for index options)
        tick_size = 5
        try:
            rows = instrument_service._get_cached_rows(request.session_token, request.environment, request.device_id)  # noqa: SLF001
            for row in rows:
                if instrument_service._coerce_positive_int(row.get("ref_id")) == request.ref_id:  # noqa: SLF001
                    ts = instrument_service._coerce_positive_int(row.get("tick_size"), 5)  # noqa: SLF001
                    if ts:
                        tick_size = ts
                    break
        except Exception:
            pass

        lots = max(1, int(request.qty // max(1, request.lot_size)))
        order_qty = lots * request.lot_size
        order_price = self._compute_aggressive_limit_price(request.exit_side, request.ltp, tick_size)

        payload = self._build_single_order_payload(
            instrument_ref_id=request.ref_id,
            order_qty=order_qty,
            order_side=request.exit_side,
            order_delivery_type=request.order_delivery_type,
            order_price=order_price,
            tag=f"nubraoss_options_exit_{request.option_leg.lower()}",
        )
        order = self._submit_single_order(
            session_token=request.session_token,
            device_id=request.device_id,
            environment=request.environment,
            payload=payload,
        )
        return PositioningExitResponse(
            status="success",
            message=f"Exit order sent for {request.display_name}.",
            order_id=instrument_service._coerce_positive_int(order.get("order_id")),  # noqa: SLF001
            order_status=str(order.get("order_status") or "").strip().upper() or None,
        )


scalper_service = ScalperService()
