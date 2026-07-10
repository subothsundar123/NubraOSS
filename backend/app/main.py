import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any
import os
import queue as _queue
import subprocess
import sys

import logging as _logging

from fastapi import Body, FastAPI, Header, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import httpx

_main_log = _logging.getLogger(__name__)

from app.config import get_cors_origins, settings
from app.schemas import (
    DeltaNeutralPairsRequest,
    DeltaNeutralPairsResponse,
    ExpiryHeatmapRequest,
    ExpiryHeatmapResponse,
    MarketStatusResponse,
    ScannerOrderPreviewRequest,
    ScannerOrderPreviewResponse,
    ScannerOrderSubmitRequest,
    ScannerOrderSubmitResponse,
    ScalperOrderRequest,
    ScalperOrderResponse,
    ScalperSnapshotRequest,
    ScalperSnapshotResponse,
    ScalperVolumeBreakoutRequest,
    ScalperVolumeBreakoutResponse,
    SessionStatusRequest,
    SessionStatusResponse,
    StartLoginRequest,
    StartLoginResponse,
    StockSearchRequest,
    StockSearchResponse,
    StrategyBacktestRequest,
    StrategyBacktestResponse,
    StrategyDailySignalLogRow,
    StrategyEquityPoint,
    StrategyInstrumentMetrics,
    StrategyInstrumentResult,
    StrategyPortfolioMetrics,
    StrategyPreviewCandle,
    StrategyPreviewChart,
    StrategyPreviewRequest,
    StrategyPreviewResponse,
    StrategyTrade,
    StrategyLivePosition,
    StrategyLiveStartRequest,
    StrategyLiveStartResponse,
    StrategyLiveStatusResponse,
    StrategyLiveStopResponse,
    TradingViewWebhookConfigureRequest,
    TradingViewWebhookConfigureResponse,
    TradingViewWebhookExecutionModeRequest,
    TradingViewWebhookExecutionModeResponse,
    TradingViewWebhookExecuteResponse,
    TradingViewWebhookResetResponse,
    TradingViewWebhookStatusResponse,
    TunnelStatusResponse,
    PositioningCandlesRequest,
    PositioningCandlesResponse,
    PositioningIndexCandlesRequest,
    PositioningIndexCandlesResponse,
    PositioningIntradayBootstrapRequest,
    PositioningIntradayBootstrapResponse,
    PositioningOptionChainRequest,
    PositioningOptionChainResponse,
    RangeTraderChartRequest,
    RangeTraderChartResponse,
    RangeTraderControlRequest,
    RangeTraderEventsResponse,
    RangeTraderInstrumentSearchRequest,
    RangeTraderInstrumentSearchResponse,
    RangeTraderKillRequest,
    RangeTraderOptionResolveRequest,
    RangeTraderOptionResolveResponse,
    RangeTraderSetupListRequest,
    RangeTraderSetupListResponse,
    RangeTraderSetupResponse,
    RangeTraderSetupUpsertRequest,
    VolumeBreakoutDrilldownPoint,
    VolumeBreakoutDrilldownRequest,
    VolumeBreakoutDrilldownResponse,
    VolumeBreakoutStartRequest,
    VolumeBreakoutStartResponse,
    VolumeBreakoutStatusResponse,
    VolumeBreakoutStopResponse,
    VerifyMpinRequest,
    VerifyMpinResponse,
    VerifyOtpRequest,
    VerifyOtpResponse,
    VerifyTotpRequest,
    VerifyTotpResponse,
    PositioningOptionOrderPreviewRequest,
    PositioningOptionOrderPreviewResponse,
    PositioningOptionCandlesRequest,
    PositioningPositionsRequest,
    PositioningPositionsResponse,
    PositioningOrdersRequest,
    PositioningOrdersResponse,
    PositioningExitRequest,
    PositioningExitResponse,
    OIEChainRequest,
    OIEChainResponse,
    OIEAnalyticsRequest,
    OIEAnalyticsResponse,
    OIEIntelligenceRequest,
    OIEIntelligenceResponse,
    SmcSnapshotRequest,
    SmcScanRequest,
)
from app.db import connect_db, load_intraday_candles_for_symbol
from app.services.auth_service import auth_service
from app.services.smc_service import smc_service
from app.services.instrument_service import instrument_service
from app.services.positioning.event_bus import positioning_event_bus
from app.services.positioning.orchestrator import positioning_orchestrator
from app.services.range_trader_live_service import RangeTraderLiveSession, RangeTraderQuoteSession
from app.services.range_trader_service import range_trader_service
from app.services.scalper_live_service import ScalperLiveSession
from app.services.scalper_service import scalper_service
from app.services.scalper_volume_breakout_service import scalper_volume_breakout_service
from app.services.strategy_backtester import parse_strategy, run_backtest
from app.services.strategy_catalog import catalog_payload
from app.services.strategy_data import fetch_preview_ohlcv
from app.services.strategy_live_service import strategy_live_service
from app.services.tradingview_webhook_service import tradingview_webhook_service
from app.services.tunnel_service import tunnel_service
from app.services.volume_breakout_service import volume_breakout_service

try:
    from app.services.volume_quote_live_service import VolumeQuoteLiveSession
    _volume_quote_import_error: str | None = None
except ModuleNotFoundError as exc:
    VolumeQuoteLiveSession = None  # type: ignore[assignment]
    _volume_quote_import_error = str(exc)

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    _main_log.warning(
        "422 RequestValidationError on %s %s: %s",
        request.method,
        request.url.path,
        exc.errors(),
    )
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


@app.on_event("startup")
def start_positioning_orchestrator() -> None:
    positioning_orchestrator.start()


@app.on_event("shutdown")
def stop_positioning_orchestrator() -> None:
    positioning_orchestrator.stop()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


_GITHUB_API = "https://api.github.com/repos/socials-zanskar/NubraOSS/commits/main"


@app.get("/api/version")
def get_version() -> dict:
    local_sha: str | None = None
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True, text=True, timeout=5,
            cwd=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        )
        if result.returncode == 0:
            local_sha = result.stdout.strip()
    except Exception:
        pass

    remote_sha: str | None = None
    try:
        resp = httpx.get(_GITHUB_API, timeout=8, headers={"Accept": "application/vnd.github+json"})
        if resp.status_code == 200:
            remote_sha = resp.json().get("sha")
    except Exception:
        pass

    up_to_date = (local_sha is not None and remote_sha is not None and local_sha == remote_sha)
    return {
        "sha": local_sha,
        "short": local_sha[:7] if local_sha else None,
        "remote_sha": remote_sha,
        "remote_short": remote_sha[:7] if remote_sha else None,
        "up_to_date": up_to_date,
    }


@app.post("/api/update")
def do_update() -> dict:
    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    try:
        result = subprocess.run(
            ["git", "pull", "origin", "main"],
            capture_output=True, text=True, timeout=60,
            cwd=repo_root,
        )
        if result.returncode == 0:
            return {"success": True, "output": result.stdout.strip()}
        return {"success": False, "error": result.stderr.strip() or result.stdout.strip()}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@app.post("/api/restart")
def do_restart() -> dict:
    if sys.platform == "win32":
        return {"success": False, "error": "Auto-restart is not supported on Windows. Please restart manually."}

    import threading

    def _restart() -> None:
        import time as _time
        _time.sleep(1.5)  # ensure HTTP response is delivered first
        os.execv(sys.executable, [sys.executable] + sys.argv)

    threading.Thread(target=_restart, daemon=True).start()
    return {"success": True}


@app.get("/api/system/public-ip")
def get_public_ip() -> dict[str, str | None]:
    services = [
        "https://api.ipify.org?format=json",
        "https://ifconfig.me/all.json",
    ]
    for url in services:
        try:
            with httpx.Client(timeout=5.0) as client:
                response = client.get(url)
                if response.status_code >= 400:
                    continue
                payload = response.json()
                ip = payload.get("ip_addr") or payload.get("ip")
                if isinstance(ip, str) and ip.strip():
                    return {"ip": ip.strip()}
        except Exception:
            continue
    return {"ip": None}


@app.get("/api/system/tunnel/status", response_model=TunnelStatusResponse)
def get_tunnel_status() -> TunnelStatusResponse:
    return tunnel_service.status()


@app.post("/api/system/tunnel/start", response_model=TunnelStatusResponse)
def start_tunnel() -> TunnelStatusResponse:
    return tunnel_service.start()


@app.post("/api/system/tunnel/stop", response_model=TunnelStatusResponse)
def stop_tunnel() -> TunnelStatusResponse:
    return tunnel_service.stop()


@app.get("/api/webhooks/tradingview/status", response_model=TradingViewWebhookStatusResponse)
def get_tradingview_webhook_status() -> TradingViewWebhookStatusResponse:
    return tradingview_webhook_service.status()


@app.post("/api/webhooks/tradingview/configure", response_model=TradingViewWebhookConfigureResponse)
def configure_tradingview_webhook(payload: TradingViewWebhookConfigureRequest) -> TradingViewWebhookConfigureResponse:
    config = tradingview_webhook_service.configure(payload)
    return TradingViewWebhookConfigureResponse(
        status="success",
        message="TradingView webhook configured successfully.",
        config=config,
    )


@app.post("/api/webhooks/tradingview/reset", response_model=TradingViewWebhookResetResponse)
def reset_tradingview_webhook() -> TradingViewWebhookResetResponse:
    tradingview_webhook_service.reset()
    return TradingViewWebhookResetResponse(
        status="success",
        message="TradingView webhook configuration cleared.",
    )


@app.post("/api/webhooks/tradingview/execution-mode", response_model=TradingViewWebhookExecutionModeResponse)
def set_tradingview_execution_mode(payload: TradingViewWebhookExecutionModeRequest) -> TradingViewWebhookExecutionModeResponse:
    status = tradingview_webhook_service.set_execution_enabled(payload.execution_enabled)
    return TradingViewWebhookExecutionModeResponse(
        status="success",
        message="Webhook execution mode updated.",
        execution_enabled=status.execution_enabled,
    )


@app.post("/api/webhooks/tradingview", response_model=TradingViewWebhookExecuteResponse)
def execute_tradingview_webhook(
    payload: dict[str, Any],
    x_webhook_secret: str | None = Header(default=None),
    x_webhook_source: str | None = Header(default=None),
) -> TradingViewWebhookExecuteResponse:
    source = "test" if isinstance(x_webhook_source, str) and x_webhook_source.strip().lower() == "test" else "live"
    return tradingview_webhook_service.execute(payload, header_secret=x_webhook_secret, source=source)


@app.post("/api/auth/start", response_model=StartLoginResponse)
def start_login(payload: StartLoginRequest) -> StartLoginResponse:
    return auth_service.start_login(payload)


@app.post("/api/auth/verify-otp", response_model=VerifyOtpResponse)
def verify_otp(payload: VerifyOtpRequest) -> VerifyOtpResponse:
    return auth_service.verify_otp(payload)


@app.post("/api/auth/verify-totp", response_model=VerifyTotpResponse)
def verify_totp(payload: VerifyTotpRequest) -> VerifyTotpResponse:
    return auth_service.verify_totp(payload)


@app.post("/api/auth/verify-mpin", response_model=VerifyMpinResponse)
def verify_mpin(payload: VerifyMpinRequest) -> VerifyMpinResponse:
    return auth_service.verify_mpin(payload)


@app.post("/api/auth/session-status", response_model=SessionStatusResponse)
def get_session_status(payload: SessionStatusRequest) -> SessionStatusResponse:
    return auth_service.session_status(payload)


@app.get("/api/strategy/catalog")
def get_strategy_catalog() -> dict:
    return catalog_payload()


@app.post("/api/strategy/backtest", response_model=StrategyBacktestResponse)
def run_strategy_backtest(payload: StrategyBacktestRequest) -> StrategyBacktestResponse:
    strategy = parse_strategy(payload.strategy)
    result = run_backtest(
        strategy=strategy,
        session_token=payload.session_token,
        device_id=payload.device_id,
        environment=payload.environment,
    )

    instruments_out = [
        StrategyInstrumentResult(
            symbol=item.symbol,
            bars_processed=item.bars_processed,
            metrics=StrategyInstrumentMetrics(**item.metrics.__dict__),
            trades=[
                StrategyTrade(
                    symbol=t.symbol,
                    side=t.side,
                    entry_timestamp=t.entry_timestamp,
                    exit_timestamp=t.exit_timestamp,
                    entry_price=t.entry_price,
                    exit_price=t.exit_price,
                    quantity=t.quantity,
                    pnl=t.pnl,
                    pnl_pct=t.pnl_pct,
                    bars_held=t.bars_held,
                    exit_reason=t.exit_reason,
                    brokerage=t.brokerage,
                )
                for t in item.trades
            ],
            equity_curve=[
                StrategyEquityPoint(timestamp=p.timestamp, equity=p.equity)
                for p in item.equity_curve
            ],
            triggered_days=[
                StrategyDailySignalLogRow(**r.__dict__)
                for r in item.triggered_days
            ],
            daily_signal_log=[
                StrategyDailySignalLogRow(**r.__dict__)
                for r in item.daily_signal_log
            ],
            warning=item.warning,
        )
        for item in result.instruments
    ]

    portfolio_out = StrategyPortfolioMetrics(
        starting_capital=result.portfolio.starting_capital,
        ending_capital=result.portfolio.ending_capital,
        gross_profit=result.portfolio.gross_profit,
        gross_loss=result.portfolio.gross_loss,
        net_pnl=result.portfolio.net_pnl,
        return_pct=result.portfolio.return_pct,
        total_trades=result.portfolio.total_trades,
        winning_trades=result.portfolio.winning_trades,
        losing_trades=result.portfolio.losing_trades,
        win_rate_pct=result.portfolio.win_rate_pct,
        profit_factor=result.portfolio.profit_factor,
        max_drawdown_pct=result.portfolio.max_drawdown_pct,
        capital_per_instrument=result.portfolio.capital_per_instrument,
        total_brokerage=result.portfolio.total_brokerage,
        equity_curve=[
            StrategyEquityPoint(timestamp=p.timestamp, equity=p.equity)
            for p in result.portfolio.equity_curve
        ],
    )

    return StrategyBacktestResponse(
        status="success",
        mode=result.mode,
        strategy_summary=result.strategy_summary,
        portfolio=portfolio_out,
        instruments=instruments_out,
    )


@app.post("/api/strategy/preview", response_model=StrategyPreviewResponse)
def get_strategy_preview(payload: StrategyPreviewRequest) -> StrategyPreviewResponse:
    df = fetch_preview_ohlcv(
        session_token=payload.session_token,
        device_id=payload.device_id,
        environment=payload.environment,
        symbol=payload.symbol,
        exchange=payload.exchange,
        instrument_type=payload.instrument_type,
        interval=payload.interval,
        bars=payload.bars,
    )

    candles = [
        StrategyPreviewCandle(
            epoch_ms=int(row.timestamp.timestamp() * 1000),
            open=float(row.open),
            high=float(row.high),
            low=float(row.low),
            close=float(row.close),
            volume=None if row.volume is None or row.volume != row.volume else float(row.volume),
        )
        for row in df.itertuples(index=False)
    ]

    last_price = candles[-1].close if candles else None
    return StrategyPreviewResponse(
        status="success",
        chart=StrategyPreviewChart(
            instrument=payload.symbol.strip().upper(),
            exchange=payload.exchange.strip().upper(),
            instrument_type=payload.instrument_type.strip().upper(),
            interval=payload.interval.strip().lower(),
            last_price=last_price,
            candles=candles,
        ),
    )


@app.post("/api/strategy/live/start", response_model=StrategyLiveStartResponse)
def start_strategy_live(payload: StrategyLiveStartRequest) -> StrategyLiveStartResponse:
    if payload.environment != "UAT":
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="No Code live strategy deployment is enabled only in UAT for now.")
    snapshot = strategy_live_service.start(
        strategy_payload=payload.strategy,
        session_token=payload.session_token,
        device_id=payload.device_id,
        environment=payload.environment,
    )
    message = "Strategy deployed live on IST interval boundaries."
    if snapshot.get("last_error"):
        message = f"Strategy deployed. Initial evaluation warned: {snapshot['last_error']}"
    return StrategyLiveStartResponse(
        status="success",
        message=message,
        job=StrategyLiveStatusResponse(**snapshot),
    )


@app.get("/api/strategy/live/status", response_model=StrategyLiveStatusResponse)
def get_strategy_live_status() -> StrategyLiveStatusResponse:
    return StrategyLiveStatusResponse(**strategy_live_service.status_payload())


@app.post("/api/strategy/live/stop", response_model=StrategyLiveStopResponse)
def stop_strategy_live() -> StrategyLiveStopResponse:
    strategy_live_service.stop()
    return StrategyLiveStopResponse(status="success", message="Strategy live runner stopped.")


@app.post("/api/instruments/stocks/search", response_model=StockSearchResponse)
def search_stocks(payload: StockSearchRequest) -> StockSearchResponse:
    items = instrument_service.search_stocks(
        session_token=payload.session_token,
        environment=payload.environment,
        device_id=payload.device_id,
        query=payload.query,
        limit=payload.limit,
    )
    return StockSearchResponse(items=items)


@app.post("/api/range-trader/instruments/search", response_model=RangeTraderInstrumentSearchResponse)
def search_range_trader_instruments(payload: RangeTraderInstrumentSearchRequest) -> RangeTraderInstrumentSearchResponse:
    return range_trader_service.search_instruments(payload)


@app.post("/api/range-trader/options/resolve", response_model=RangeTraderOptionResolveResponse)
def resolve_range_trader_option(payload: RangeTraderOptionResolveRequest) -> RangeTraderOptionResolveResponse:
    return range_trader_service.resolve_option(payload)


@app.post("/api/range-trader/chart", response_model=RangeTraderChartResponse)
def get_range_trader_chart(payload: RangeTraderChartRequest) -> RangeTraderChartResponse:
    return range_trader_service.chart(payload)


@app.post("/api/range-trader/setups/list", response_model=RangeTraderSetupListResponse)
def list_range_trader_setups(payload: RangeTraderSetupListRequest) -> RangeTraderSetupListResponse:
    return range_trader_service.list_setups(payload)


@app.post("/api/range-trader/setups", response_model=RangeTraderSetupResponse)
def upsert_range_trader_setup(payload: RangeTraderSetupUpsertRequest) -> RangeTraderSetupResponse:
    return range_trader_service.upsert_setup(payload)


@app.post("/api/range-trader/arm", response_model=RangeTraderSetupResponse)
def arm_range_trader(payload: RangeTraderControlRequest) -> RangeTraderSetupResponse:
    return range_trader_service.arm(payload)


@app.post("/api/range-trader/pause", response_model=RangeTraderSetupResponse)
def pause_range_trader(payload: RangeTraderControlRequest) -> RangeTraderSetupResponse:
    return range_trader_service.pause(payload)


@app.post("/api/range-trader/stop", response_model=RangeTraderSetupResponse)
def stop_range_trader(payload: RangeTraderControlRequest) -> RangeTraderSetupResponse:
    return range_trader_service.stop(payload)


@app.post("/api/range-trader/kill", response_model=RangeTraderSetupResponse)
def kill_range_trader(payload: RangeTraderKillRequest) -> RangeTraderSetupResponse:
    return range_trader_service.kill(payload)


@app.post("/api/range-trader/events", response_model=RangeTraderEventsResponse)
def get_range_trader_events(payload: RangeTraderControlRequest) -> RangeTraderEventsResponse:
    return range_trader_service.events(payload)


@app.websocket("/ws/range-trader")
async def range_trader_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        raw = await asyncio.wait_for(websocket.receive_json(), timeout=20.0)
        if not isinstance(raw, dict):
            raise ValueError("Init payload must be an object.")
    except asyncio.TimeoutError:
        await websocket.close(code=1008, reason="Timeout waiting for init params.")
        return
    except WebSocketDisconnect:
        return
    except Exception as exc:
        try:
            await websocket.send_json({"type": "error", "message": f"Invalid init params: {exc}"})
        finally:
            await websocket.close(code=1008)
        return

    session = RangeTraderLiveSession(raw)
    await session.run(websocket)


@app.websocket("/ws/range-trader/quotes")
async def range_trader_quotes_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        raw = await asyncio.wait_for(websocket.receive_json(), timeout=20.0)
        if not isinstance(raw, dict):
            raise ValueError("Init payload must be an object.")
    except asyncio.TimeoutError:
        await websocket.close(code=1008, reason="Timeout waiting for init params.")
        return
    except WebSocketDisconnect:
        return
    except Exception as exc:
        try:
            await websocket.send_json({"type": "error", "message": f"Invalid init params: {exc}"})
        finally:
            await websocket.close(code=1008)
        return

    session = RangeTraderQuoteSession(raw)
    await session.run(websocket)


@app.post("/api/scalper/snapshot", response_model=ScalperSnapshotResponse)
def get_scalper_snapshot(payload: ScalperSnapshotRequest) -> ScalperSnapshotResponse:
    return scalper_service.snapshot(payload)


@app.post("/api/scalper/delta-neutral", response_model=DeltaNeutralPairsResponse)
def get_scalper_delta_neutral_pairs(payload: DeltaNeutralPairsRequest) -> DeltaNeutralPairsResponse:
    return scalper_service.delta_neutral_pairs(payload)


@app.post("/api/scalper/expiry-heatmap", response_model=ExpiryHeatmapResponse)
def get_scalper_expiry_heatmap(payload: ExpiryHeatmapRequest) -> ExpiryHeatmapResponse:
    return scalper_service.expiry_heatmap(payload)


@app.post("/api/scalper/volume-breakout", response_model=ScalperVolumeBreakoutResponse)
def get_scalper_volume_breakout(payload: ScalperVolumeBreakoutRequest) -> ScalperVolumeBreakoutResponse:
    return scalper_volume_breakout_service.volume_breakout_finder(payload)


@app.post("/api/scalper/order", response_model=ScalperOrderResponse)
def place_scalper_order(payload: ScalperOrderRequest) -> ScalperOrderResponse:
    return scalper_service.place_order(payload)


@app.post("/api/scanner/order-preview", response_model=ScannerOrderPreviewResponse)
def preview_scanner_order(payload: ScannerOrderPreviewRequest) -> ScannerOrderPreviewResponse:
    return scalper_service.preview_stock_order(payload)


@app.post("/api/scanner/order", response_model=ScannerOrderSubmitResponse)
def place_scanner_order(payload: ScannerOrderSubmitRequest) -> ScannerOrderSubmitResponse:
    return scalper_service.place_stock_order(payload)


@app.websocket("/ws/scalper")
async def scalper_live_ws(websocket: WebSocket) -> None:
    """
    Live scalper WebSocket endpoint.

    Protocol:
      1. Client connects.
      2. Client sends a JSON init message matching ScalperSnapshotRequest fields.
      3. Server responds with {"type": "init", "option_pair": {...}, "panels": {...}}
         containing full historical candles for all three panels.
      4. Server streams {"type": "candle_update", "panel": "...", "candle": {...}}
         every poll interval as the current candle updates.
      5. Every 5 minutes the server sends {"type": "reconcile", "panel": "...", "candles": [...]}
         with the last 12 authoritative candles for drift correction.
    """
    await websocket.accept()
    raw: dict | None = None
    try:
        raw = await asyncio.wait_for(websocket.receive_json(), timeout=20.0)
        request = ScalperSnapshotRequest(**raw)
    except asyncio.TimeoutError:
        await websocket.close(code=1008, reason="Timeout waiting for init params.")
        return
    except WebSocketDisconnect:
        return
    except Exception as exc:
        try:
            await websocket.send_json({"type": "error", "message": f"Invalid init params: {exc}"})
        except Exception:
            pass
        try:
            await websocket.close(code=1008)
        except Exception:
            pass
        return

    session = ScalperLiveSession(request=request)
    if isinstance(raw, dict):
        seed_snapshot = raw.get("seed_snapshot")
        if isinstance(seed_snapshot, dict):
            session.prime_from_seed_snapshot(seed_snapshot)
    await session.run(websocket)


@app.post("/api/volume-breakout/start", response_model=VolumeBreakoutStartResponse)
def start_volume_breakout(payload: VolumeBreakoutStartRequest) -> VolumeBreakoutStartResponse:
    job = volume_breakout_service.start(payload)
    message = "Volume dashboard synced and ranking scan started."
    if job.last_error:
        message = f"Volume dashboard started with warning: {job.last_error}"
    return VolumeBreakoutStartResponse(status="success", message=message, job=job)


@app.get("/api/volume-breakout/status", response_model=VolumeBreakoutStatusResponse)
def get_volume_breakout_status() -> VolumeBreakoutStatusResponse:
    return volume_breakout_service.status()


@app.post("/api/volume-breakout/stop", response_model=VolumeBreakoutStopResponse)
def stop_volume_breakout() -> VolumeBreakoutStopResponse:
    volume_breakout_service.stop()
    return VolumeBreakoutStopResponse(status="success", message="Volume dashboard refresh loop stopped.")


@app.post("/api/volume-breakout/eod", response_model=VolumeBreakoutStatusResponse)
def get_volume_breakout_eod(payload: VolumeBreakoutStartRequest) -> VolumeBreakoutStatusResponse:
    return volume_breakout_service.eod_snapshot(payload)


@app.post("/api/volume-breakout/drilldown", response_model=VolumeBreakoutDrilldownResponse)
def get_volume_breakout_drilldown(payload: VolumeBreakoutDrilldownRequest) -> VolumeBreakoutDrilldownResponse:
    return volume_breakout_service.drilldown(payload)


_IST = timezone(timedelta(hours=5, minutes=30))


@app.post("/api/positioning/candles", response_model=PositioningCandlesResponse)
def get_positioning_candles(payload: PositioningCandlesRequest) -> PositioningCandlesResponse:
    session_start_ist = datetime.now(tz=_IST).replace(hour=9, minute=0, second=0, microsecond=0)
    since_utc = session_start_ist.astimezone(timezone.utc)
    conn = connect_db()
    try:
        rows = load_intraday_candles_for_symbol(
            conn,
            symbol=payload.symbol,
            exchange=payload.exchange,
            since_timestamp=since_utc,
        )
    finally:
        conn.close()
    points: list[VolumeBreakoutDrilldownPoint] = []
    for row in rows:
        ts_raw: str = row.get("bucket_timestamp", "")
        try:
            dt = datetime.fromisoformat(ts_raw.replace("Z", "+00:00"))
            epoch_ms: int | None = int(dt.timestamp() * 1000)
            time_ist = dt.astimezone(_IST).strftime("%Y-%m-%dT%H:%M:%S+05:30")
        except Exception:
            epoch_ms = None
            time_ist = ts_raw
        points.append(
            VolumeBreakoutDrilldownPoint(
                time_ist=time_ist,
                epoch_ms=epoch_ms,
                open=row.get("open_price"),
                high=row.get("high_price"),
                low=row.get("low_price"),
                close=float(row.get("close_price") or 0),
                volume=float(row.get("bucket_volume") or 0),
            )
        )
    return PositioningCandlesResponse(
        symbol=payload.symbol.strip().upper(),
        exchange=payload.exchange.strip().upper(),
        points=points,
    )


@app.post("/api/positioning/option-chain", response_model=PositioningOptionChainResponse)
def get_positioning_option_chain(payload: PositioningOptionChainRequest) -> PositioningOptionChainResponse:
    return scalper_service.option_chain_for_positioning(payload)


@app.post("/api/debug/option-chain-raw")
def debug_option_chain_raw(payload: PositioningOptionChainRequest) -> dict:
    """Returns the raw broker option chain payload. Use only for diagnostics."""
    return scalper_service._debug_option_chain_raw(  # noqa: SLF001
        session_token=payload.session_token,
        device_id=payload.device_id,
        environment=payload.environment,
        underlying=payload.underlying,
    )


@app.post("/api/positioning/index-candles", response_model=PositioningIndexCandlesResponse)
def get_positioning_index_candles(payload: PositioningIndexCandlesRequest) -> PositioningIndexCandlesResponse:
    return scalper_service.index_candles_for_positioning(payload)


@app.post("/api/positioning/intraday-bootstrap", response_model=PositioningIntradayBootstrapResponse)
async def positioning_intraday_bootstrap(payload: PositioningIntradayBootstrapRequest) -> PositioningIntradayBootstrapResponse:
    return await scalper_service.intraday_bootstrap_for_positioning(payload)


@app.post("/api/positioning/option-order-preview", response_model=PositioningOptionOrderPreviewResponse)
def positioning_option_order_preview(payload: PositioningOptionOrderPreviewRequest) -> PositioningOptionOrderPreviewResponse:
    return scalper_service.preview_option_order(payload)


@app.post("/api/positioning/positions", response_model=PositioningPositionsResponse)
def get_positioning_positions(payload: PositioningPositionsRequest) -> PositioningPositionsResponse:
    return scalper_service.get_positions_for_positioning(payload)


@app.post("/api/positioning/orders", response_model=PositioningOrdersResponse)
def get_positioning_orders(payload: PositioningOrdersRequest) -> PositioningOrdersResponse:
    return scalper_service.get_orders_for_positioning(payload)


@app.post("/api/positioning/exit", response_model=PositioningExitResponse)
def positioning_exit(payload: PositioningExitRequest) -> PositioningExitResponse:
    return scalper_service.exit_position(payload)


@app.post("/api/positioning/option-candles", response_model=PositioningIndexCandlesResponse)
def get_positioning_option_candles(payload: PositioningOptionCandlesRequest) -> PositioningIndexCandlesResponse:
    return scalper_service.option_candles_for_positioning(payload)


# ── Options Intelligence Engine ───────────────────────────────────────────────

@app.post("/api/oie/chain", response_model=OIEChainResponse)
def oie_chain(payload: OIEChainRequest) -> OIEChainResponse:
    from app.schemas import PositioningOptionChainRequest
    from app.services.options_intelligence.chain_normalizer import build_oie_chain, persist_snapshot

    base_req = PositioningOptionChainRequest(
        session_token=payload.session_token,
        device_id=payload.device_id,
        environment=payload.environment,
        underlying=payload.underlying,
        expiry=payload.expiry,
    )
    base = scalper_service.option_chain_for_positioning(base_req)
    oie = build_oie_chain(base, lot_size=base.lot_size)
    persist_snapshot(oie, environment=str(payload.environment))
    return oie


@app.post("/api/oie/analytics", response_model=OIEAnalyticsResponse)
def oie_analytics(payload: OIEAnalyticsRequest) -> OIEAnalyticsResponse:
    from datetime import datetime
    from app.schemas import PositioningOptionChainRequest
    from app.services.options_intelligence.chain_normalizer import build_oie_chain, persist_snapshot
    from app.services.options_intelligence.analytics_engine import run_analytics, record_iv_snapshot

    base_req = PositioningOptionChainRequest(
        session_token=payload.session_token,
        device_id=payload.device_id,
        environment=payload.environment,
        underlying=payload.underlying,
        expiry=payload.expiry,
    )
    base = scalper_service.option_chain_for_positioning(base_req)
    oie = build_oie_chain(base, lot_size=base.lot_size)
    persist_snapshot(oie, environment=str(payload.environment))
    record_iv_snapshot(oie, environment=str(payload.environment))
    metrics = run_analytics(oie, environment=str(payload.environment))
    return OIEAnalyticsResponse(
        underlying=oie.underlying,
        spot_price=oie.spot_price,
        fetched_at=oie.fetched_at,
        metrics=metrics,
    )


@app.post("/api/oie/intelligence", response_model=OIEIntelligenceResponse)
def oie_intelligence(payload: OIEIntelligenceRequest) -> OIEIntelligenceResponse:
    from app.schemas import PositioningOptionChainRequest
    from app.services.options_intelligence.chain_normalizer import build_oie_chain, persist_snapshot
    from app.services.options_intelligence.analytics_engine import run_analytics, record_iv_snapshot
    from app.services.options_intelligence.intelligence_engine import build_intelligence

    base_req = PositioningOptionChainRequest(
        session_token=payload.session_token,
        device_id=payload.device_id,
        environment=payload.environment,
        underlying=payload.underlying,
        expiry=payload.expiry,
    )
    base = scalper_service.option_chain_for_positioning(base_req)
    oie = build_oie_chain(base, lot_size=base.lot_size)
    persist_snapshot(oie, environment=str(payload.environment))
    record_iv_snapshot(oie, environment=str(payload.environment))
    metrics = run_analytics(oie, environment=str(payload.environment))
    intel = build_intelligence(metrics, oie)

    # Fire alerts for any active strategies that match
    try:
        from app.services.options_intelligence.alert_engine import fire_alerts
        fire_alerts(metrics, oie, environment=str(payload.environment))
    except Exception:
        pass

    return OIEIntelligenceResponse(
        underlying=oie.underlying,
        spot_price=oie.spot_price,
        atm_strike=oie.atm_strike,
        fetched_at=oie.fetched_at,
        market_bias=intel.market_bias,
        confidence_score=intel.confidence_score,
        volatility_regime=intel.volatility_regime,
        gamma_regime=intel.gamma_regime,
        dealer_positioning=intel.dealer_positioning,
        expected_move_daily=intel.expected_move_daily,
        expected_move_weekly=intel.expected_move_weekly,
        option_seller_favorability=intel.option_seller_favorability,
        key_levels=intel.key_levels,
        interpretation_bullets=intel.interpretation_bullets,
        metric_summary=intel.metric_summary,
        metrics=metrics,
    )


@app.post("/api/oie/signal")
def oie_signal(payload: OIEIntelligenceRequest) -> dict[str, Any]:
    import dataclasses
    from app.schemas import PositioningOptionChainRequest
    from app.services.options_intelligence.chain_normalizer import build_oie_chain, persist_snapshot
    from app.services.options_intelligence.analytics_engine import run_analytics, record_iv_snapshot
    from app.services.options_intelligence.signal_engine import build_signals, persist_signal_snapshot

    base_req = PositioningOptionChainRequest(
        session_token=payload.session_token,
        device_id=payload.device_id,
        environment=payload.environment,
        underlying=payload.underlying,
        expiry=payload.expiry,
    )
    base = scalper_service.option_chain_for_positioning(base_req)
    oie = build_oie_chain(base, lot_size=base.lot_size)
    persist_snapshot(oie, environment=str(payload.environment))
    record_iv_snapshot(oie, environment=str(payload.environment))
    metrics = run_analytics(oie, environment=str(payload.environment))
    report = build_signals(metrics, oie)
    persist_signal_snapshot(report, environment=str(payload.environment))

    return {
        "underlying": report.underlying,
        "generated_at": report.generated_at,
        "composite_direction": report.composite_direction,
        "composite_score": report.composite_score,
        "bull_score": report.bull_score,
        "bear_score": report.bear_score,
        "summary": report.summary,
        "signals": [dataclasses.asdict(s) for s in report.signals],
        "top_signals": [dataclasses.asdict(s) for s in report.top_signals],
    }


@app.post("/api/oie/refresh")
def oie_refresh(payload: OIEIntelligenceRequest) -> dict[str, Any]:
    """Single-call endpoint: one Nubra API hit → chain + intelligence + signals."""
    import dataclasses
    from app.schemas import PositioningOptionChainRequest
    from app.services.options_intelligence.chain_normalizer import build_oie_chain, persist_snapshot
    from app.services.options_intelligence.analytics_engine import run_analytics, record_iv_snapshot
    from app.services.options_intelligence.intelligence_engine import build_intelligence
    from app.services.options_intelligence.signal_engine import build_signals, persist_signal_snapshot

    base_req = PositioningOptionChainRequest(
        session_token=payload.session_token,
        device_id=payload.device_id,
        environment=payload.environment,
        underlying=payload.underlying,
        expiry=payload.expiry,
    )
    base = scalper_service.option_chain_for_positioning(base_req)
    oie = build_oie_chain(base, lot_size=base.lot_size)
    persist_snapshot(oie, environment=str(payload.environment))
    record_iv_snapshot(oie, environment=str(payload.environment))
    metrics = run_analytics(oie, environment=str(payload.environment))
    intel = build_intelligence(metrics, oie)
    report = build_signals(metrics, oie)
    persist_signal_snapshot(report, environment=str(payload.environment))

    try:
        from app.services.options_intelligence.alert_engine import fire_alerts
        fire_alerts(metrics, oie, environment=str(payload.environment))
    except Exception:
        pass

    from fastapi.encoders import jsonable_encoder

    # Chain data (full strikes list) — use model_dump for Pydantic v2 models
    chain_data = {
        "underlying": oie.underlying,
        "spot_price": oie.spot_price,
        "atm_strike": oie.atm_strike,
        "expiry": oie.expiry,
        "lot_size": oie.lot_size,
        "pcr": oie.pcr,
        "max_pain": oie.max_pain,
        "straddle_price": oie.straddle_price,
        "total_ce_oi": oie.total_ce_oi,
        "total_pe_oi": oie.total_pe_oi,
        "aggregates": oie.aggregates.model_dump(),
        "fetched_at": oie.fetched_at,
        "market_closed": oie.market_closed,
        "strikes": [s.model_dump() for s in oie.strikes],
    }
    # Intelligence data
    intel_data = {
        "underlying": oie.underlying,
        "spot_price": oie.spot_price,
        "atm_strike": oie.atm_strike,
        "fetched_at": oie.fetched_at,
        "market_bias": intel.market_bias,
        "confidence_score": intel.confidence_score,
        "volatility_regime": intel.volatility_regime,
        "gamma_regime": intel.gamma_regime,
        "dealer_positioning": intel.dealer_positioning,
        "expected_move_daily": intel.expected_move_daily,
        "expected_move_weekly": intel.expected_move_weekly,
        "option_seller_favorability": intel.option_seller_favorability,
        "key_levels": intel.key_levels,
        "interpretation_bullets": intel.interpretation_bullets,
        "metric_summary": intel.metric_summary,
        "metrics": jsonable_encoder(metrics),
    }
    # Signal data
    signal_data = {
        "underlying": report.underlying,
        "generated_at": report.generated_at,
        "composite_direction": report.composite_direction,
        "composite_score": report.composite_score,
        "bull_score": report.bull_score,
        "bear_score": report.bear_score,
        "summary": report.summary,
        "signals": [dataclasses.asdict(s) for s in report.signals],
        "top_signals": [dataclasses.asdict(s) for s in report.top_signals],
    }
    return {"chain": chain_data, "intelligence": intel_data, "signal": signal_data}


@app.post("/api/oie/strategy/save")
def oie_strategy_save(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    import uuid
    import json as _json
    from datetime import datetime, timezone
    from app.db import get_db_connection
    session_token = payload.get("session_token", "")
    if not session_token or len(str(session_token)) < 10:
        raise HTTPException(status_code=401, detail="Valid session_token required")
    sid = payload.get("id") or str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    with get_db_connection() as conn:
        conn.execute(
            """insert into oie_strategies
               (id,name,underlying,description,entry_conditions_json,exit_conditions_json,action,is_active,created_at,updated_at)
               values(?,?,?,?,?,?,?,?,?,?)
               on conflict(id) do update set
                 name=excluded.name,
                 underlying=excluded.underlying,
                 description=excluded.description,
                 entry_conditions_json=excluded.entry_conditions_json,
                 exit_conditions_json=excluded.exit_conditions_json,
                 action=excluded.action,
                 is_active=excluded.is_active,
                 updated_at=excluded.updated_at""",
            (
                sid,
                payload.get("name", "Strategy"),
                payload.get("underlying", "NIFTY"),
                payload.get("description", ""),
                _json.dumps(payload.get("entry_conditions", [])),
                _json.dumps(payload.get("exit_conditions", [])),
                payload.get("action", "alert"),
                1,
                now,
                now,
            ),
        )
    return {"id": sid, "saved": True}


@app.get("/api/oie/strategy/list")
def oie_strategy_list(underlying: str = "NIFTY") -> dict[str, Any]:
    import json as _json
    from app.db import get_db_connection
    with get_db_connection() as conn:
        rows = conn.execute(
            "select id,name,underlying,action,is_active,created_at,entry_conditions_json,exit_conditions_json "
            "from oie_strategies where underlying=? order by created_at desc",
            (underlying.upper(),),
        ).fetchall()
    strategies = []
    for r in rows:
        d = dict(zip(["id", "name", "underlying", "action", "is_active", "created_at",
                       "entry_conditions_json", "exit_conditions_json"], r))
        try:
            d["entry_conditions"] = _json.loads(d.pop("entry_conditions_json") or "[]")
        except Exception:
            d["entry_conditions"] = []
        try:
            d["exit_conditions"] = _json.loads(d.pop("exit_conditions_json") or "[]")
        except Exception:
            d["exit_conditions"] = []
        strategies.append(d)
    return {"strategies": strategies}


@app.post("/api/oie/alerts")
def oie_alerts(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    from app.services.options_intelligence.alert_engine import get_recent_alerts
    underlying = payload.get("underlying", "NIFTY")
    environment = payload.get("environment", "PROD")
    limit = int(payload.get("limit", 50))
    min_score = float(payload.get("min_score", 0.0))
    severity_filter = payload.get("severity_filter", "all")
    alerts = get_recent_alerts(
        underlying=underlying,
        environment=environment,
        limit=limit,
        min_score=min_score,
        severity_filter=severity_filter,
    )
    return {"alerts": alerts, "total": len(alerts)}


@app.post("/api/oie/risk/save")
def oie_risk_save(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    import uuid as _uuid
    from app.db import get_db_connection
    underlying = payload.get("underlying", "NIFTY")
    environment = payload.get("environment", "PROD")
    risk = payload.get("risk_profile", {})
    cb = payload.get("circuit_breaker", {})
    rid = f"{underlying.upper()}_{environment}"
    with get_db_connection() as conn:
        conn.execute(
            """insert or replace into oie_risk_profiles
               (id, underlying, environment, updated_at,
                max_loss_per_trade, max_daily_loss, position_size_lots,
                stop_loss_pct, target_pct, time_stop_minutes,
                circuit_breaker_enabled, circuit_breaker_max_losses,
                circuit_breaker_daily_floor, automation_enabled)
               values (?,?,?,datetime('now'),?,?,?,?,?,?,?,?,?,?)""",
            (
                rid, underlying.upper(), environment,
                float(risk.get("max_loss_per_trade", 5000)),
                float(risk.get("max_daily_loss", 15000)),
                int(risk.get("position_size_lots", 1)),
                float(risk.get("stop_loss_pct", 25)),
                float(risk.get("target_pct", 50)),
                int(risk.get("time_stop_minutes", 60)),
                1 if cb.get("enabled", True) else 0,
                int(cb.get("max_consecutive_losses", 3)),
                float(cb.get("daily_pnl_floor", -15000)),
                1 if payload.get("automation_enabled", False) else 0,
            ),
        )
    return {"saved": True, "id": rid}


@app.post("/api/oie/execute")
def oie_execute(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    """
    Place an options trade from the OIE automation panel.
    Validates risk profile and circuit breaker before submitting.
    """
    import uuid as _uuid
    import dataclasses
    from datetime import datetime, timezone
    from app.db import get_db_connection
    from app.schemas import PositioningOptionOrderPreviewRequest

    session_token = payload.get("session_token", "")
    device_id = payload.get("device_id", "")
    environment = payload.get("environment", "PROD")
    underlying = (payload.get("underlying") or "NIFTY").upper()
    expiry: str | None = payload.get("expiry") or None
    strike_price = float(payload.get("strike_price", 0))
    option_type = (payload.get("option_type") or "PE").upper()
    order_side = payload.get("order_side") or "ORDER_SIDE_SELL"
    lots = int(payload.get("lots", 1))
    ltp_price = float(payload.get("ltp_price", 0))
    signal_direction = payload.get("signal_direction") or "Neutral"

    if not session_token or strike_price <= 0 or ltp_price <= 0:
        raise HTTPException(status_code=400, detail="Missing required fields: session_token, strike_price, ltp_price")

    with get_db_connection() as conn:
        # ── Risk profile check ───────────────────────────────────────────────
        risk_row = conn.execute(
            "SELECT * FROM oie_risk_profiles WHERE underlying=? AND environment=? LIMIT 1",
            (underlying, environment),
        ).fetchone()

        if not risk_row:
            raise HTTPException(
                status_code=403,
                detail="No risk profile configured. Set up your risk profile in the Automation tab first.",
            )
        if not risk_row["automation_enabled"]:
            raise HTTPException(
                status_code=403,
                detail="Automation is disabled for this underlying. Enable it in the Automation tab first.",
            )

        # ── Circuit breaker check ────────────────────────────────────────────
        if risk_row["circuit_breaker_enabled"]:
            today = datetime.now(timezone.utc).date().isoformat()
            # Count today's executions that resulted in losses (simple: count failed or loss)
            today_executions = conn.execute(
                "SELECT COUNT(*) FROM oie_execution_log WHERE underlying=? AND environment=? "
                "AND date(executed_at)=? AND status = 'error'",
                (underlying, environment, today),
            ).fetchone()[0]
            max_losses = risk_row["circuit_breaker_max_losses"]
            if today_executions >= max_losses:
                raise HTTPException(
                    status_code=429,
                    detail=f"Circuit breaker triggered: {today_executions} trades today (limit {max_losses}). "
                           "Reset via Automation tab or wait for next trading day.",
                )

        # ── Preview order (resolve instrument + compute limit price) ─────────
        preview_req = PositioningOptionOrderPreviewRequest(
            session_token=session_token,
            device_id=device_id,
            environment=environment,
            underlying=underlying,
            strike_price=strike_price,
            option_type=option_type,
            expiry=expiry,
            order_side=order_side,
            lots=lots,
            ltp_price=ltp_price,
        )
        preview = scalper_service.preview_option_order(preview_req)

        # ── Place order ──────────────────────────────────────────────────────
        from app.schemas import ScalperOrderRequest
        place_req = ScalperOrderRequest(
            session_token=session_token,
            device_id=device_id,
            environment=environment,
            instrument_ref_id=preview.instrument_ref_id,
            instrument_display_name=preview.instrument_display_name,
            option_leg=option_type,
            order_side=order_side,
            lots=lots,
            lot_size=preview.lot_size,
            tick_size=preview.tick_size,
            ltp_price=ltp_price,
            order_delivery_type=preview.order_delivery_type,
            tag=preview.tag,
        )

        exec_id = str(_uuid.uuid4())
        order_id = None
        order_status = None
        exec_status = "error"
        error_msg = None

        try:
            order_resp = scalper_service.place_order(place_req)
            order_id = order_resp.order_id
            order_status = order_resp.order_status
            exec_status = "placed"
        except HTTPException as e:
            error_msg = e.detail
        except Exception as e:
            error_msg = str(e)

        # ── Log execution ────────────────────────────────────────────────────
        conn.execute(
            """insert into oie_execution_log
               (id, underlying, environment, executed_at, signal_direction,
                strike_price, option_type, order_side, lots, order_qty,
                ltp_price, limit_price, estimated_value,
                order_id, order_status, instrument_display_name, status, error_message)
               values (?,?,?,datetime('now'),?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                exec_id, underlying, environment, signal_direction,
                strike_price, option_type, order_side, lots,
                preview.order_qty, ltp_price,
                preview.preview_limit_price, preview.estimated_order_value,
                order_id, order_status,
                preview.instrument_display_name, exec_status, error_msg,
            ),
        )

    if exec_status == "error":
        raise HTTPException(status_code=502, detail=f"Order placement failed: {error_msg}")

    return {
        "execution_id": exec_id,
        "status": exec_status,
        "order_id": order_id,
        "order_status": order_status,
        "instrument": preview.instrument_display_name,
        "order_qty": preview.order_qty,
        "limit_price": preview.preview_limit_price,
        "estimated_value": preview.estimated_order_value,
    }


@app.get("/api/oie/executions")
def oie_executions(underlying: str = "NIFTY", environment: str = "PROD", limit: int = 20) -> dict[str, Any]:
    """Return recent execution history for the Automation tab."""
    from app.db import get_db_connection
    with get_db_connection() as conn:
        rows = conn.execute(
            """SELECT id, executed_at, signal_direction, strike_price, option_type,
                      order_side, lots, order_qty, ltp_price, limit_price, estimated_value,
                      order_id, order_status, instrument_display_name, status, error_message
               FROM oie_execution_log
               WHERE underlying=? AND environment=?
               ORDER BY executed_at DESC LIMIT ?""",
            (underlying.upper(), environment, limit),
        ).fetchall()
    return {"executions": [dict(r) for r in rows]}


@app.post("/api/oie/backtest")
def oie_backtest(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    from app.services.options_intelligence.backtest_engine import run_backtest, BacktestTrade

    underlying = payload.get("underlying", "NIFTY")
    environment = payload.get("environment", "PROD")
    from_date = payload.get("from_date", "")
    to_date = payload.get("to_date", "")
    lots = int(payload.get("position_size_lots", 1))
    stop_loss_pct = float(payload.get("stop_loss_pct", 25))
    target_pct = float(payload.get("target_pct", 50))
    time_stop = int(payload.get("time_stop_minutes", 60))
    strategy_id = payload.get("strategy_id") or None

    result = run_backtest(
        underlying=underlying,
        environment=environment,
        from_date=from_date,
        to_date=to_date,
        position_size_lots=lots,
        stop_loss_pct=stop_loss_pct,
        target_pct=target_pct,
        time_stop_minutes=time_stop,
        strategy_id=strategy_id,
    )

    return {
        "total_trades": result.total_trades,
        "winning_trades": result.winning_trades,
        "losing_trades": result.losing_trades,
        "total_pnl": result.total_pnl,
        "max_drawdown": result.max_drawdown,
        "win_rate": result.win_rate,
        "avg_win": result.avg_win,
        "avg_loss": result.avg_loss,
        "profit_factor": result.profit_factor,
        "sharpe_ratio": result.sharpe_ratio,
        "trades": [t.__dict__ for t in result.trades],
    }


@app.get("/api/system/market-status", response_model=MarketStatusResponse)
def get_market_status() -> MarketStatusResponse:
    info = volume_breakout_service.market_status_info()
    return MarketStatusResponse(**info)


@app.get("/api/positioning/status")
def get_positioning_status() -> dict[str, Any]:
    return positioning_orchestrator.status()


@app.get("/api/positioning/snapshot")
def get_positioning_snapshot() -> dict[str, Any]:
    return positioning_orchestrator.snapshot().model_dump()


@app.websocket("/ws/positioning")
async def positioning_ws(websocket: WebSocket) -> None:
    """
    Central Phase 1 positioning stream.

    Protocol:
      1. Client connects and sends a small init JSON payload.
      2. Server replies with {"type": "snapshot", "payload": <full positioning snapshot>}.
      3. Server streams updated snapshots from the orchestrator every refresh cycle.
      4. Server sends {"type": "heartbeat"} when idle.
    """
    await websocket.accept()
    try:
        raw = await asyncio.wait_for(websocket.receive_json(), timeout=20.0)
        if not isinstance(raw, dict):
            raise ValueError("Init payload must be an object.")
    except asyncio.TimeoutError:
        await websocket.close(code=1008, reason="Timeout waiting for init params.")
        return
    except WebSocketDisconnect:
        return
    except Exception as exc:
        try:
            await websocket.send_json({"type": "error", "message": f"Invalid init params: {exc}"})
        finally:
            await websocket.close(code=1008)
        return

    event_queue = positioning_event_bus.subscribe()
    try:
        bootstrap = positioning_orchestrator.bootstrap_scanner(raw)
        snapshot = positioning_orchestrator.snapshot()
        await websocket.send_json(
            {
                "type": "snapshot",
                "seq": snapshot.seq,
                "payload": snapshot.model_dump(),
                "scanner_bootstrap": bootstrap,
            }
        )
        loop = asyncio.get_running_loop()
        while True:
            try:
                event = await asyncio.wait_for(
                    loop.run_in_executor(None, lambda: event_queue.get(timeout=30)),
                    timeout=35.0,
                )
                await websocket.send_json(event.model_dump())
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "heartbeat", "seq": positioning_orchestrator.snapshot().seq})
    except WebSocketDisconnect:
        pass
    finally:
        positioning_event_bus.unsubscribe(event_queue)


@app.websocket("/ws/oie")
async def oie_ws(websocket: WebSocket) -> None:
    """
    Options Intelligence Engine live stream.

    Protocol:
      1. Client connects and sends init JSON:
         {"session_token":"..","device_id":"..","environment":"PROD",
          "underlying":"NIFTY","expiry":null,"interval_seconds":30}
      2. Server immediately fetches chain, runs pipeline, sends:
         {"type":"data","chain":{..},"intelligence":{..},"signal":{..}}
      3. Server repeats every interval_seconds automatically.
      4. Client can send {"cmd":"switch","underlying":"BANKNIFTY"} mid-session.
      5. Server sends {"type":"heartbeat"} when market is closed.
    """
    await websocket.accept()
    try:
        init = await asyncio.wait_for(websocket.receive_json(), timeout=20.0)
    except asyncio.TimeoutError:
        await websocket.close(code=1008, reason="Timeout waiting for init params.")
        return
    except WebSocketDisconnect:
        return
    except Exception as exc:
        try:
            await websocket.send_json({"type": "error", "message": f"Invalid init: {exc}"})
        finally:
            await websocket.close(code=1008)
        return

    session_token: str = str(init.get("session_token", ""))
    device_id: str = str(init.get("device_id", ""))
    environment: str = str(init.get("environment", "PROD"))
    underlying: list[str] = [str(init.get("underlying", "NIFTY"))]  # mutable via closure
    expiry: list[str | None] = [init.get("expiry") or None]
    interval: list[int] = [max(15, min(300, int(init.get("interval_seconds", 30))))]

    loop = asyncio.get_running_loop()

    def _run_pipeline() -> dict[str, Any]:
        import dataclasses
        from fastapi.encoders import jsonable_encoder
        from app.schemas import PositioningOptionChainRequest
        from app.services.options_intelligence.chain_normalizer import build_oie_chain, persist_snapshot
        from app.services.options_intelligence.analytics_engine import run_analytics, record_iv_snapshot
        from app.services.options_intelligence.intelligence_engine import build_intelligence
        from app.services.options_intelligence.signal_engine import build_signals, persist_signal_snapshot

        req = PositioningOptionChainRequest(
            session_token=session_token,
            device_id=device_id,
            environment=environment,
            underlying=underlying[0],
            expiry=expiry[0],
        )
        base = scalper_service.option_chain_for_positioning(req)
        oie = build_oie_chain(base, lot_size=base.lot_size)
        persist_snapshot(oie, environment=environment)
        record_iv_snapshot(oie, environment=environment)
        metrics = run_analytics(oie, environment=environment)
        intel = build_intelligence(metrics, oie)
        report = build_signals(metrics, oie)
        persist_signal_snapshot(report, environment=environment)
        try:
            from app.services.options_intelligence.alert_engine import fire_alerts
            fire_alerts(metrics, oie, environment=environment)
        except Exception:
            pass
        return {
            "type": "data",
            "chain": {
                "underlying": oie.underlying, "spot_price": oie.spot_price,
                "atm_strike": oie.atm_strike, "expiry": oie.expiry,
                "lot_size": oie.lot_size, "pcr": oie.pcr,
                "max_pain": oie.max_pain, "straddle_price": oie.straddle_price,
                "total_ce_oi": oie.total_ce_oi, "total_pe_oi": oie.total_pe_oi,
                "aggregates": oie.aggregates.model_dump(),
                "fetched_at": oie.fetched_at, "market_closed": oie.market_closed,
                "strikes": [s.model_dump() for s in oie.strikes],
            },
            "intelligence": {
                "underlying": oie.underlying, "spot_price": oie.spot_price,
                "atm_strike": oie.atm_strike, "fetched_at": oie.fetched_at,
                "market_bias": intel.market_bias, "confidence_score": intel.confidence_score,
                "volatility_regime": intel.volatility_regime, "gamma_regime": intel.gamma_regime,
                "dealer_positioning": intel.dealer_positioning,
                "expected_move_daily": intel.expected_move_daily,
                "expected_move_weekly": intel.expected_move_weekly,
                "option_seller_favorability": intel.option_seller_favorability,
                "key_levels": intel.key_levels,
                "interpretation_bullets": intel.interpretation_bullets,
                "metric_summary": intel.metric_summary,
                "metrics": jsonable_encoder(metrics),
            },
            "signal": {
                "underlying": report.underlying, "generated_at": report.generated_at,
                "composite_direction": report.composite_direction,
                "composite_score": report.composite_score,
                "bull_score": report.bull_score, "bear_score": report.bear_score,
                "summary": report.summary,
                "signals": [dataclasses.asdict(s) for s in report.signals],
                "top_signals": [dataclasses.asdict(s) for s in report.top_signals],
            },
        }

    async def fetch_and_send() -> None:
        try:
            result = await loop.run_in_executor(None, _run_pipeline)
            await websocket.send_json(result)
        except Exception as exc:
            try:
                await websocket.send_json({"type": "error", "message": str(exc)})
            except Exception:
                pass

    try:
        # Send initial data immediately
        await fetch_and_send()

        while True:
            # Wait for client message or interval timeout
            try:
                msg = await asyncio.wait_for(websocket.receive_json(), timeout=float(interval[0]))
                cmd = msg.get("cmd") if isinstance(msg, dict) else None
                if cmd == "switch":
                    underlying[0] = str(msg.get("underlying", underlying[0]))
                    expiry[0] = msg.get("expiry") or None
                    if "interval_seconds" in msg:
                        interval[0] = max(15, min(300, int(msg["interval_seconds"])))
                    await fetch_and_send()
                elif cmd == "ping":
                    await websocket.send_json({"type": "pong"})
            except asyncio.TimeoutError:
                # Regular interval tick
                await fetch_and_send()
    except WebSocketDisconnect:
        pass
    finally:
        # Ensure the WS is closed even if the loop exits unexpectedly
        try:
            await websocket.close()
        except Exception:
            pass


@app.post("/api/smc/snapshot")
def smc_snapshot(payload: SmcSnapshotRequest) -> dict:
    return smc_service.snapshot(
        session_token=payload.session_token,
        device_id=payload.device_id,
        environment=payload.environment,
        exchange=payload.exchange,
        symbol=payload.symbol,
        interval=payload.interval,
    )


@app.post("/api/smc/scan")
def smc_scan(payload: SmcScanRequest) -> dict:
    return smc_service.scan(
        session_token=payload.session_token,
        device_id=payload.device_id,
        environment=payload.environment,
        exchange=payload.exchange,
        symbols=payload.symbols,
        interval=payload.interval,
    )


@app.websocket("/ws/oie-ltp")
async def oie_ltp_ws(websocket: WebSocket) -> None:
    """
    Fast LTP stream for tracked option positions.

    Protocol:
      1. Client connects and sends init JSON:
         {"session_token":"..","device_id":"..","environment":"PROD",
          "refs":[{"ref_id":12345,"label":"24500-CE"},...],
          "interval_seconds":2}
      2. Server polls /orderbooks/{ref_id}?levels=1 for each ref, every interval_seconds.
      3. Server sends {"type":"quotes","quotes":{"24500-CE":145.5,...}} after each poll round.
      4. Client can update refs mid-session: {"type":"set_refs","refs":[...]}
      5. Interval clamped to [1, 10] seconds.
    """
    await websocket.accept()
    try:
        init = await asyncio.wait_for(websocket.receive_json(), timeout=20.0)
    except asyncio.TimeoutError:
        await websocket.close(code=1008, reason="Timeout waiting for init params.")
        return
    except WebSocketDisconnect:
        return
    except Exception as exc:
        try:
            await websocket.send_json({"type": "error", "message": f"Invalid init: {exc}"})
        finally:
            await websocket.close(code=1008)
        return

    session_token: str = str(init.get("session_token", ""))
    device_id: str = str(init.get("device_id", ""))
    environment: str = str(init.get("environment", "PROD"))
    interval_seconds: float = max(1.0, min(10.0, float(init.get("interval_seconds", 2))))
    refs: list[dict] = list(init.get("refs") or [])

    def _base_url() -> str:
        return settings.nubra_uat_base_url if environment == "UAT" else settings.nubra_prod_base_url

    def _headers() -> dict[str, str]:
        return {
            "Authorization": f"Bearer {session_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "x-device-id": device_id,
        }

    async def _fetch_quotes(client: httpx.AsyncClient, current_refs: list[dict]) -> dict[str, float]:
        quotes: dict[str, float] = {}
        for r in current_refs:
            ref_id = r.get("ref_id")
            label = str(r.get("label", ""))
            if not ref_id or not label:
                continue
            try:
                resp = await client.get(
                    f"{_base_url()}/orderbooks/{ref_id}",
                    params={"levels": 1},
                    headers=_headers(),
                    timeout=5.0,
                )
                if resp.status_code < 400:
                    payload = resp.json()
                    ob = payload.get("orderBook") if isinstance(payload.get("orderBook"), dict) else payload
                    raw: Any = None
                    for key in ("ltp", "last_traded_price", "lastTradedPrice", "last_price", "lastPrice"):
                        if ob.get(key) not in (None, "", 0):
                            raw = ob[key]
                            break
                    if raw is None:
                        continue
                    price = float(raw)
                    # Nubra orderbook API returns prices in paise (NSE convention).
                    # Divide by 100 to get rupees. The threshold 50 guards against
                    # stocks/futures with genuine rupee prices above ₹50 that would
                    # never appear as option LTPs in this context.
                    price = round(price / 100.0, 2)
                    if price > 0:
                        quotes[label] = price
            except Exception:
                pass
        return quotes

    try:
        async with httpx.AsyncClient() as client:
            while True:
                # Poll for LTP quotes
                if refs:
                    quotes = await _fetch_quotes(client, refs)
                    if quotes:
                        try:
                            await websocket.send_json({"type": "quotes", "quotes": quotes})
                        except Exception:
                            break

                # Wait for interval or client message
                try:
                    msg = await asyncio.wait_for(websocket.receive_json(), timeout=interval_seconds)
                    msg_type = str(msg.get("type", ""))
                    if msg_type == "set_refs":
                        refs = list(msg.get("refs") or [])
                    elif msg_type == "ping":
                        await websocket.send_json({"type": "pong"})
                except asyncio.TimeoutError:
                    pass  # Normal tick — continue
                except WebSocketDisconnect:
                    break
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


@app.websocket("/ws/volume-breakout")
async def volume_breakout_ws(websocket: WebSocket) -> None:
    """
    Volume breakout WebSocket endpoint.
    Protocol:
      1. Client connects.
      2. Client sends JSON init params matching VolumeBreakoutStartRequest fields.
      3. Server sends {"type": "scan_ready", "payload": <current snapshot>}.
      4. Server streams {"type": "scan_update", "payload": {...}} after each gap-fill batch and refresh cycle.
      5. Server sends {"type": "gap_fill_complete", "payload": {...}} when gap-fill finishes.
      6. Server sends {"type": "ping"} every 30s when idle to keep connection alive.
    """
    await websocket.accept()

    try:
        raw = await asyncio.wait_for(websocket.receive_json(), timeout=20.0)
        request = VolumeBreakoutStartRequest(**raw)
    except asyncio.TimeoutError:
        await websocket.close(code=1008, reason="Timeout waiting for init params.")
        return
    except WebSocketDisconnect:
        return
    except Exception as exc:
        try:
            await websocket.send_json({"type": "error", "message": f"Invalid init params: {exc}"})
        except Exception:
            pass
        try:
            await websocket.close(code=1008)
        except Exception:
            pass
        return

    event_queue: _queue.SimpleQueue = _queue.SimpleQueue()
    volume_breakout_service.register_event_queue(event_queue)

    job = volume_breakout_service.start(request)
    try:
        await websocket.send_json({"type": "scan_ready", "payload": job.model_dump()})
    except Exception:
        volume_breakout_service.unregister_event_queue(event_queue)
        return

    loop = asyncio.get_running_loop()

    try:
        while True:
            try:
                event = await asyncio.wait_for(
                    loop.run_in_executor(None, lambda: event_queue.get(timeout=30)),
                    timeout=35.0,
                )
                await websocket.send_json(event)
            except (asyncio.TimeoutError, Exception):
                try:
                    await websocket.send_json({"type": "ping"})
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    finally:
        volume_breakout_service.unregister_event_queue(event_queue)
        volume_breakout_service.maybe_stop_if_unowned()


@app.websocket("/ws/volume-quotes")
async def volume_quotes_ws(websocket: WebSocket) -> None:
    """
    Lightweight live quote endpoint for the actionable volume dashboard.

    The client keeps this socket open for the selected leader plus a small
    rotating watchlist. It intentionally does not subscribe the entire NSE.
    """
    if VolumeQuoteLiveSession is None:
        await websocket.accept()
        try:
            await websocket.send_json(
                {
                    "type": "error",
                    "message": "Volume live quotes are unavailable in this environment.",
                    "detail": _volume_quote_import_error,
                }
            )
        finally:
            await websocket.close(code=1011)
        return

    await websocket.accept()
    try:
        raw = await asyncio.wait_for(websocket.receive_json(), timeout=20.0)
    except asyncio.TimeoutError:
        await websocket.close(code=1008, reason="Timeout waiting for init params.")
        return
    except WebSocketDisconnect:
        return
    except Exception as exc:
        try:
            await websocket.send_json({"type": "error", "message": f"Invalid init params: {exc}"})
        except Exception:
            pass
        try:
            await websocket.close(code=1008)
        except Exception:
            pass
        return

    session = VolumeQuoteLiveSession(raw if isinstance(raw, dict) else {})
    await session.run(websocket)
