from typing import Any, Literal

from pydantic import BaseModel, Field


Environment = Literal["PROD", "UAT"]
AuthMethod = Literal["otp", "totp"]
VolumeUniverseMode = Literal["top120", "top300", "all_nse"]
RangeTraderPositionStatus = Literal["idle", "entry_pending", "in_position", "exit_pending", "closed"]
RangeTraderExchange = Literal["NSE", "BSE", "NFO"]


class StartLoginRequest(BaseModel):
    phone: str = Field(min_length=10, max_length=15)
    environment: Environment
    auth_method: AuthMethod = "otp"


class StartLoginResponse(BaseModel):
    flow_id: str
    next_step: Literal["otp", "totp"]
    masked_phone: str
    environment: Environment
    device_id: str
    message: str


class VerifyOtpRequest(BaseModel):
    flow_id: str
    otp: str = Field(min_length=4, max_length=8)


class VerifyOtpResponse(BaseModel):
    flow_id: str
    next_step: Literal["mpin"]
    message: str


class VerifyTotpRequest(BaseModel):
    flow_id: str
    totp: str = Field(min_length=4, max_length=8)


class VerifyTotpResponse(BaseModel):
    flow_id: str
    next_step: Literal["mpin"]
    message: str


class VerifyMpinRequest(BaseModel):
    flow_id: str
    mpin: str = Field(min_length=4, max_length=6)


class VerifyMpinResponse(BaseModel):
    access_token: str
    refresh_token: str
    user_name: str
    account_id: str
    device_id: str
    environment: Environment
    broker: Literal["Nubra"]
    expires_in: int
    message: str


class SessionStatusRequest(BaseModel):
    session_token: str = Field(min_length=10)
    device_id: str = Field(min_length=3, max_length=128)
    environment: Environment


class SessionStatusResponse(BaseModel):
    active: bool
    environment: Environment
    expires_at_utc: str | None
    account_id: str | None = None
    message: str


class TunnelStatusResponse(BaseModel):
    running: bool
    public_url: str | None
    target_url: str
    last_error: str | None
    logs: list[str]


class TradingViewWebhookLogEntry(BaseModel):
    time_ist: str
    level: Literal["info", "success", "error"]
    message: str
    payload: dict[str, Any] | None = None


class TradingViewWebhookHistoryEntry(BaseModel):
    id: str
    time_ist: str
    day_ist: str
    source: Literal["test", "live"]
    status: Literal["received", "accepted", "blocked", "error"]
    strategy: str | None
    tag: str | None
    instrument: str | None
    exchange: str | None
    action: str | None
    quantity: int | None
    order_id: int | None
    order_status: str | None
    pnl: float | None
    requested_qty: int | None
    placed_qty: int | None
    filled_qty: int | None
    avg_filled_price: float | None
    order_price: float | None
    ltp_price: float | None
    ref_id: int | None
    lot_size: int | None
    tick_size: int | None
    message: str
    payload: dict[str, Any] | None = None


class TradingViewWebhookSummary(BaseModel):
    total_events: int
    live_events: int
    test_events: int
    blocked_events: int
    error_events: int
    accepted_events: int
    today_pnl: float
    today_orders: int


class TradingViewWebhookOrderRow(BaseModel):
    time_ist: str
    source: Literal["test", "live"]
    strategy: str | None
    tag: str | None
    instrument: str | None
    exchange: str | None
    action: str | None
    requested_qty: int | None
    placed_qty: int | None
    filled_qty: int | None
    order_price: float | None
    avg_filled_price: float | None
    current_price: float | None
    order_id: int | None
    order_status: str | None
    pnl: float | None


class TradingViewWebhookPositionRow(BaseModel):
    strategy: str | None
    tag: str | None
    instrument: str
    exchange: str
    net_qty: int
    avg_entry_price: float | None
    current_price: float | None
    realized_pnl: float
    unrealized_pnl: float
    total_pnl: float
    direction: Literal["LONG", "SHORT", "FLAT"]


class TradingViewWebhookPnlSummary(BaseModel):
    realized_pnl: float
    unrealized_pnl: float
    total_pnl: float
    open_positions: int
    closed_groups: int


class TradingViewWebhookConfigureRequest(BaseModel):
    session_token: str = Field(min_length=10)
    device_id: str = Field(min_length=3, max_length=128)
    environment: Environment
    user_name: str = Field(min_length=1, max_length=128)
    account_id: str = Field(min_length=1, max_length=128)
    secret: str | None = Field(default=None, min_length=6, max_length=128)
    order_delivery_type: Literal["ORDER_DELIVERY_TYPE_CNC", "ORDER_DELIVERY_TYPE_IDAY"] = "ORDER_DELIVERY_TYPE_IDAY"


class TradingViewWebhookStatusResponse(BaseModel):
    configured: bool
    environment: Environment | None
    broker: Literal["Nubra"] | None
    user_name: str | None
    account_id: str | None
    configured_at_utc: str | None
    order_delivery_type: Literal["ORDER_DELIVERY_TYPE_CNC", "ORDER_DELIVERY_TYPE_IDAY"] | None
    secret: str | None
    has_secret: bool
    webhook_path: str
    webhook_url: str | None
    strategy_template: dict[str, Any]
    line_alert_template: dict[str, Any]
    execution_enabled: bool
    last_error: str | None
    logs: list[TradingViewWebhookLogEntry]
    history: list[TradingViewWebhookHistoryEntry]
    summary: TradingViewWebhookSummary
    order_history: list[TradingViewWebhookOrderRow]
    positions: list[TradingViewWebhookPositionRow]
    pnl_summary: TradingViewWebhookPnlSummary


class TradingViewWebhookConfigureResponse(BaseModel):
    status: Literal["success"]
    message: str
    config: TradingViewWebhookStatusResponse


class TradingViewWebhookResetResponse(BaseModel):
    status: Literal["success"]
    message: str


class TradingViewWebhookExecutionModeRequest(BaseModel):
    execution_enabled: bool


class TradingViewWebhookExecutionModeResponse(BaseModel):
    status: Literal["success"]
    message: str
    execution_enabled: bool


class TradingViewWebhookExecuteResponse(BaseModel):
    status: Literal["accepted"]
    message: str
    order_id: int | None
    order_status: str | None
    symbol: str
    exchange: str
    action: str
    quantity: int


Interval = Literal["1m", "2m", "3m", "5m", "15m", "30m", "1h", "1d", "1w", "1mt"]
OrderDeliveryType = Literal["ORDER_DELIVERY_TYPE_CNC", "ORDER_DELIVERY_TYPE_IDAY"]


class ScalperSnapshotRequest(BaseModel):
    session_token: str = Field(min_length=10)
    device_id: str = Field(min_length=3, max_length=128)
    environment: Environment
    underlying: str = Field(min_length=2, max_length=64)
    exchange: Literal["NSE", "BSE"] = "NSE"
    interval: Interval = "1m"
    ce_strike_price: int = Field(ge=1, le=1000000)
    pe_strike_price: int = Field(ge=1, le=1000000)
    expiry: str | None = Field(default=None, max_length=64)
    lookback_days: int = Field(default=5, ge=1, le=15)


class ScalperCandle(BaseModel):
    time_ist: str
    epoch_ms: int
    open: float
    high: float
    low: float
    close: float
    volume: float | None


class ScalperChartPanel(BaseModel):
    instrument: str
    display_name: str
    exchange: str
    instrument_type: str
    interval: Interval
    last_price: float | None
    candles: list[ScalperCandle]


class ScalperResolvedOptionPair(BaseModel):
    underlying: str
    exchange: str
    expiry: str | None
    ce_strike_price: int
    pe_strike_price: int
    call_ref_id: int | None
    put_ref_id: int | None
    call_display_name: str
    put_display_name: str
    lot_size: int | None
    tick_size: int | None


class ScalperSnapshotResponse(BaseModel):
    status: Literal["success"]
    message: str
    underlying: ScalperChartPanel
    call_option: ScalperChartPanel
    put_option: ScalperChartPanel
    option_pair: ScalperResolvedOptionPair


class ScalperOrderRequest(BaseModel):
    session_token: str = Field(min_length=10)
    device_id: str = Field(min_length=3, max_length=128)
    environment: Environment
    instrument_ref_id: int = Field(ge=1)
    instrument_display_name: str = Field(min_length=1, max_length=128)
    option_leg: Literal["CE", "PE"]
    order_side: Literal["ORDER_SIDE_BUY", "ORDER_SIDE_SELL"]
    lots: int = Field(default=1, ge=1, le=1000)
    lot_size: int = Field(ge=1, le=1000000)
    tick_size: int = Field(ge=1, le=1000000)
    ltp_price: float | None = Field(default=None, ge=0)
    order_delivery_type: Literal["ORDER_DELIVERY_TYPE_CNC", "ORDER_DELIVERY_TYPE_IDAY", "ORDER_DELIVERY_TYPE_NRML"] = "ORDER_DELIVERY_TYPE_IDAY"
    exchange: Literal["NSE", "BSE"] = "NSE"
    tag: str | None = Field(default=None, max_length=128)


class ScalperOrderResponse(BaseModel):
    status: Literal["success"]
    message: str
    order_id: int | None
    order_status: str | None
    order_side: Literal["ORDER_SIDE_BUY", "ORDER_SIDE_SELL"]
    order_qty: int
    order_price: float | None
    lots: int
    instrument_display_name: str


class ScannerOrderPreviewRequest(BaseModel):
    session_token: str = Field(min_length=10)
    device_id: str = Field(min_length=3, max_length=128)
    environment: Environment
    symbol: str = Field(min_length=1, max_length=64)
    instrument_display_name: str = Field(min_length=1, max_length=128)
    exchange: Literal["NSE", "BSE"] = "NSE"
    order_side: Literal["ORDER_SIDE_BUY", "ORDER_SIDE_SELL"]
    quantity: int = Field(default=1, ge=1, le=1000000)
    ltp_price: float | None = Field(default=None, gt=0)
    order_delivery_type: Literal["ORDER_DELIVERY_TYPE_CNC", "ORDER_DELIVERY_TYPE_IDAY"] = "ORDER_DELIVERY_TYPE_IDAY"


class ScannerOrderPreviewResponse(BaseModel):
    status: Literal["success"]
    message: str
    environment: Environment
    symbol: str
    instrument_display_name: str
    exchange: Literal["NSE", "BSE"]
    instrument_ref_id: int
    order_side: Literal["ORDER_SIDE_BUY", "ORDER_SIDE_SELL"]
    requested_qty: int
    order_qty: int
    lot_size: int
    tick_size: int
    ltp_price: float
    preview_limit_price: float
    estimated_order_value: float
    order_delivery_type: Literal["ORDER_DELIVERY_TYPE_CNC", "ORDER_DELIVERY_TYPE_IDAY"]
    tag: str


class ScannerOrderSubmitRequest(BaseModel):
    session_token: str = Field(min_length=10)
    device_id: str = Field(min_length=3, max_length=128)
    environment: Environment
    symbol: str = Field(min_length=1, max_length=64)
    instrument_display_name: str = Field(min_length=1, max_length=128)
    exchange: Literal["NSE", "BSE"] = "NSE"
    instrument_ref_id: int = Field(ge=1)
    order_side: Literal["ORDER_SIDE_BUY", "ORDER_SIDE_SELL"]
    quantity: int = Field(default=1, ge=1, le=1000000)
    lot_size: int = Field(ge=1, le=1000000)
    tick_size: int = Field(ge=1, le=1000000)
    ltp_price: float | None = Field(default=None, gt=0)
    order_delivery_type: Literal["ORDER_DELIVERY_TYPE_CNC", "ORDER_DELIVERY_TYPE_IDAY"] = "ORDER_DELIVERY_TYPE_IDAY"
    tag: str | None = Field(default=None, max_length=128)


class ScannerOrderSubmitResponse(BaseModel):
    status: Literal["success"]
    message: str
    order_id: int | None
    order_status: str | None
    order_side: Literal["ORDER_SIDE_BUY", "ORDER_SIDE_SELL"]
    requested_qty: int
    order_qty: int
    order_price: float | None
    instrument_display_name: str
    symbol: str
    environment: Environment


class PositioningOptionOrderPreviewRequest(BaseModel):
    session_token: str = Field(min_length=10)
    device_id: str = Field(min_length=3, max_length=128)
    environment: Environment
    underlying: str = Field(min_length=1, max_length=32)
    strike_price: float = Field(gt=0)
    option_type: Literal["CE", "PE"]
    expiry: str | None = None
    ref_id: int | None = None
    order_side: Literal["ORDER_SIDE_BUY", "ORDER_SIDE_SELL"]
    lots: int = Field(default=1, ge=1, le=500)
    ltp_price: float = Field(gt=0)
    exchange: Literal["NSE", "BSE"] = "NSE"
    order_delivery_type: Literal["ORDER_DELIVERY_TYPE_IDAY", "ORDER_DELIVERY_TYPE_NRML"] = "ORDER_DELIVERY_TYPE_NRML"


class PositioningOptionOrderPreviewResponse(BaseModel):
    status: Literal["success"]
    environment: Environment
    underlying: str
    strike_price: float
    option_type: Literal["CE", "PE"]
    expiry: str | None
    instrument_ref_id: int
    instrument_display_name: str
    lot_size: int
    tick_size: int
    lots: int
    order_qty: int
    ltp_price: float
    preview_limit_price: float
    estimated_order_value: float
    order_side: Literal["ORDER_SIDE_BUY", "ORDER_SIDE_SELL"]
    order_delivery_type: Literal["ORDER_DELIVERY_TYPE_IDAY", "ORDER_DELIVERY_TYPE_NRML"]
    tag: str


class DeltaNeutralPairRow(BaseModel):
    rank: int
    underlying: str
    exchange: str
    expiry: str | None
    ce_strike_price: int
    pe_strike_price: int
    call_display_name: str
    put_display_name: str
    spot_price: float | None
    center_strike: int
    width_points: int
    call_delta: float | None
    put_delta: float | None
    net_delta: float | None
    neutrality_score: float
    lot_size: int | None
    tick_size: int | None


class DeltaNeutralPairsRequest(BaseModel):
    session_token: str = Field(min_length=10)
    device_id: str = Field(min_length=3, max_length=128)
    environment: Environment
    underlying: str = Field(min_length=2, max_length=64)
    exchange: Literal["NSE", "BSE"] = "NSE"
    expiry: str | None = Field(default=None, max_length=64)
    limit: int = Field(default=5, ge=1, le=10)


class DeltaNeutralPairsResponse(BaseModel):
    status: Literal["success"]
    message: str
    pairs: list[DeltaNeutralPairRow]


class ExpiryHeatmapRequest(BaseModel):
    session_token: str = Field(min_length=10)
    device_id: str = Field(min_length=3, max_length=128)
    environment: Environment
    underlying: str = Field(min_length=2, max_length=64)
    exchange: Literal["NSE", "BSE"] = "NSE"
    interval: Interval = "1m"
    expiry: str | None = Field(default=None, max_length=64)
    limit: int = Field(default=9, ge=3, le=15)


class ExpiryHeatmapRow(BaseModel):
    strike_price: int
    expiry: str | None
    distance_from_spot: int
    call_display_name: str | None
    put_display_name: str | None
    call_last_price: float | None
    put_last_price: float | None
    call_volume: float | None
    put_volume: float | None
    call_change_pct: float | None
    put_change_pct: float | None
    call_heat: float
    put_heat: float


class ExpiryHeatmapResponse(BaseModel):
    status: Literal["success"]
    message: str
    underlying: str
    exchange: str
    expiry: str | None
    interval: Interval
    spot_price: float | None
    center_strike: int | None
    rows: list[ExpiryHeatmapRow]


class ScalperVolumeBreakoutRequest(BaseModel):
    session_token: str = Field(min_length=10)
    device_id: str = Field(min_length=3, max_length=128)
    environment: Environment
    exchange: Literal["NSE", "BSE"] = "NSE"
    interval: Interval = "1m"
    lookback_days: int = Field(default=5, ge=3, le=20)
    limit: int = Field(default=30, ge=1, le=200)


class ScalperVolumeBreakoutRow(BaseModel):
    rank: int
    underlying: str
    display_name: str
    exchange: str
    last_price: float | None
    current_volume: float | None
    average_volume: float | None
    volume_ratio: float
    price_change_pct: float | None
    breakout_strength: float
    status_label: str
    nearest_expiry: str | None
    atm_strike: int | None


class ScalperVolumeBreakoutResponse(BaseModel):
    status: Literal["success"]
    message: str
    lookback_days: int
    rows: list[ScalperVolumeBreakoutRow]


class StockSearchRequest(BaseModel):
    session_token: str = Field(min_length=10)
    device_id: str = Field(min_length=3, max_length=128)
    environment: Environment
    query: str = Field(min_length=1, max_length=128)
    limit: int = Field(default=8, ge=1, le=20)


class StockSearchItem(BaseModel):
    instrument: str
    display_name: str
    exchange: str
    ref_id: int
    tick_size: int
    lot_size: int


class StockSearchResponse(BaseModel):
    items: list[StockSearchItem]


class RangeTraderInstrumentSearchRequest(BaseModel):
    session_token: str = Field(min_length=10)
    device_id: str = Field(min_length=3, max_length=128)
    environment: Environment
    query: str = Field(min_length=1, max_length=128)
    limit: int = Field(default=12, ge=1, le=40)


class RangeTraderInstrument(BaseModel):
    symbol: str
    display_name: str
    exchange: RangeTraderExchange
    instrument_type: str
    derivative_type: str | None = None
    option_type: str | None = None
    expiry: str | None = None
    strike_price: float | None = None
    chart_symbol: str | None = None
    ltp_hint: float | None = Field(default=None, gt=0)
    ref_id: int
    tick_size: int
    lot_size: int


class RangeTraderInstrumentSearchResponse(BaseModel):
    items: list[RangeTraderInstrument]


class RangeTraderOptionResolveRequest(BaseModel):
    session_token: str = Field(min_length=10)
    device_id: str = Field(min_length=3, max_length=128)
    environment: Environment
    underlying: str = Field(default="NIFTY", min_length=1, max_length=32)
    strike_price: float = Field(gt=0)
    option_type: Literal["CE", "PE"]
    expiry: str | None = None
    exchange: RangeTraderExchange = "NFO"
    ref_id: int | None = Field(default=None, ge=1)
    ltp_hint: float | None = Field(default=None, gt=0)


class RangeTraderOptionResolveResponse(BaseModel):
    status: Literal["success"]
    instrument: RangeTraderInstrument


class RangeTraderCandle(BaseModel):
    epoch_ms: int
    open: float
    high: float
    low: float
    close: float
    volume: float | None = None


class RangeTraderChartRequest(BaseModel):
    session_token: str = Field(min_length=10)
    device_id: str = Field(min_length=3, max_length=128)
    environment: Environment
    symbol: str = Field(min_length=1, max_length=128)
    ref_id: int | None = Field(default=None, ge=1)
    display_name: str | None = Field(default=None, max_length=128)
    chart_symbol: str | None = Field(default=None, max_length=128)
    exchange: RangeTraderExchange = "NSE"
    instrument_type: str = Field(default="STOCK", min_length=2, max_length=32)
    derivative_type: str | None = Field(default=None, max_length=32)
    option_type: Literal["CE", "PE"] | None = None
    expiry: str | None = Field(default=None, max_length=32)
    strike_price: float | None = Field(default=None, gt=0)
    ltp_hint: float | None = Field(default=None, gt=0)
    timeframe: Literal["1m", "3m", "5m", "15m"] = "1m"
    lookback_days: int = Field(default=7, ge=1, le=15)


class RangeTraderChartResponse(BaseModel):
    status: Literal["success"]
    instrument: RangeTraderInstrument
    timeframe: Literal["1m", "3m", "5m", "15m"]
    last_price: float | None
    candles: list[RangeTraderCandle]
    synthetic: bool = False
    synthetic_reason: str | None = None


class RangeTraderLine(BaseModel):
    id: str
    role: Literal["entry", "exit", "target", "stop_loss", "alert"]
    shape: Literal["level", "trend"] = "level"
    label: str
    trigger: Literal["touch", "cross", "close_above", "close_below"] = "touch"
    repeat_policy: Literal["once", "every_touch", "after_reset_distance", "after_exit"] = "once"
    reset_distance: float | None = Field(default=None, ge=0)
    close_buffer: float | None = Field(default=None, ge=0)
    armed: bool = True
    points: list[dict[str, float]]


class RangeTraderSetupPayload(BaseModel):
    lines: list[RangeTraderLine] = Field(default_factory=list)
    entries: list[dict[str, Any]] = Field(default_factory=list)
    line_states: dict[str, dict[str, Any]] = Field(default_factory=dict)
    position_status: RangeTraderPositionStatus = "idle"
    open_quantity: int = Field(default=0, ge=0)
    entry_order_id: int | None = None
    exit_order_id: int | None = None
    entry_price: float | None = None
    exit_price: float | None = None
    limit_price: float | None = Field(default=None, gt=0)
    notes: str | None = Field(default=None, max_length=1000)


class RangeTraderSetupUpsertRequest(BaseModel):
    session_token: str = Field(min_length=10)
    device_id: str = Field(min_length=3, max_length=128)
    account_id: str = Field(min_length=1, max_length=128)
    environment: Environment
    id: str | None = Field(default=None, max_length=64)
    title: str = Field(default="Range Trader", min_length=1, max_length=128)
    instrument: RangeTraderInstrument
    timeframe: Literal["1m", "3m", "5m", "15m"] = "1m"
    side: Literal["BUY", "SELL"] = "BUY"
    quantity: int = Field(default=1, ge=1, le=1000000)
    order_type: Literal["AGGRESSIVE_LIMIT", "MARKET", "LIMIT"] = "AGGRESSIVE_LIMIT"
    tolerance_value: float = Field(default=0.05, ge=0)
    tolerance_mode: Literal["percent", "ticks", "points"] = "percent"
    max_loss: float | None = Field(default=None, ge=0)
    exit_on_max_loss: bool = True
    status: Literal["draft", "armed", "paused", "stopped", "risk_locked"] = "draft"
    payload: RangeTraderSetupPayload = Field(default_factory=RangeTraderSetupPayload)


class RangeTraderSetup(BaseModel):
    id: str
    account_id: str
    environment: Environment
    title: str
    symbol: str
    display_name: str
    exchange: RangeTraderExchange
    instrument_type: str
    derivative_type: str | None = None
    option_type: str | None = None
    expiry: str | None = None
    strike_price: float | None = None
    ref_id: int
    tick_size: int
    lot_size: int
    timeframe: Literal["1m", "3m", "5m", "15m"]
    side: Literal["BUY", "SELL"]
    quantity: int
    order_type: Literal["AGGRESSIVE_LIMIT", "MARKET", "LIMIT"]
    tolerance_value: float
    tolerance_mode: Literal["percent", "ticks", "points"]
    max_loss: float | None = None
    exit_on_max_loss: bool
    status: Literal["draft", "armed", "paused", "stopped", "risk_locked"]
    created_at: str
    updated_at: str
    payload: RangeTraderSetupPayload


class RangeTraderSetupListRequest(BaseModel):
    session_token: str = Field(min_length=10)
    device_id: str = Field(min_length=3, max_length=128)
    account_id: str = Field(min_length=1, max_length=128)
    environment: Environment


class RangeTraderSetupListResponse(BaseModel):
    setups: list[RangeTraderSetup]


class RangeTraderSetupResponse(BaseModel):
    status: Literal["success"]
    setup: RangeTraderSetup


class RangeTraderControlRequest(BaseModel):
    session_token: str = Field(min_length=10)
    device_id: str = Field(min_length=3, max_length=128)
    setup_id: str = Field(min_length=1, max_length=64)
    account_id: str = Field(min_length=1, max_length=128)
    environment: Environment


class RangeTraderKillRequest(RangeTraderControlRequest):
    session_token: str = Field(min_length=10)
    device_id: str = Field(min_length=3, max_length=128)
    exit_open_entries: bool = True


class RangeTraderEvent(BaseModel):
    id: str
    setup_id: str
    account_id: str
    environment: Environment
    created_at: str
    level: Literal["info", "success", "warn", "error"]
    event_type: str
    message: str
    payload: dict[str, Any] = Field(default_factory=dict)


class RangeTraderEventsResponse(BaseModel):
    events: list[RangeTraderEvent]


class StrategyBacktestRequest(BaseModel):
    session_token: str = Field(min_length=10)
    device_id: str = Field(min_length=3, max_length=128)
    environment: Environment
    strategy: dict[str, Any]


class StrategyPreviewRequest(BaseModel):
    session_token: str = Field(min_length=10)
    device_id: str = Field(min_length=3, max_length=128)
    environment: Environment
    symbol: str = Field(min_length=1, max_length=128)
    exchange: str = Field(default="NSE", min_length=2, max_length=16)
    instrument_type: str = Field(default="STOCK", min_length=2, max_length=32)
    interval: str = Field(min_length=1, max_length=16)
    bars: int = Field(default=180, ge=20, le=500)


class StrategyPreviewCandle(BaseModel):
    epoch_ms: int
    open: float
    high: float
    low: float
    close: float
    volume: float | None


class StrategyPreviewChart(BaseModel):
    instrument: str
    exchange: str
    instrument_type: str
    interval: str
    last_price: float | None
    candles: list[StrategyPreviewCandle]


class StrategyPreviewResponse(BaseModel):
    status: Literal["success"]
    chart: StrategyPreviewChart


# ---- New backtest output types (mirrors nubra_backtester output schema) ----


class StrategyEquityPoint(BaseModel):
    timestamp: str
    equity: float


class StrategyTrade(BaseModel):
    symbol: str
    side: Literal["BUY", "SELL"]
    entry_timestamp: str
    exit_timestamp: str
    entry_price: float
    exit_price: float
    quantity: float
    pnl: float
    pnl_pct: float
    bars_held: int
    exit_reason: str
    brokerage: float


class StrategyDailySignalLogRow(BaseModel):
    timestamp: str
    open: float
    high: float
    low: float
    close: float
    volume: float | None
    entry_signal: bool
    exit_signal: bool
    action: str
    position_state: str
    stop_loss_price: float | None
    target_price: float | None


class StrategyInstrumentMetrics(BaseModel):
    starting_capital: float
    ending_capital: float
    gross_profit: float
    gross_loss: float
    net_pnl: float
    return_pct: float
    total_trades: int
    winning_trades: int
    losing_trades: int
    win_rate_pct: float
    avg_pnl: float
    avg_pnl_pct: float
    profit_factor: float | None
    max_drawdown_pct: float
    total_brokerage: float


class StrategyInstrumentResult(BaseModel):
    symbol: str
    bars_processed: int
    metrics: StrategyInstrumentMetrics
    trades: list[StrategyTrade]
    equity_curve: list[StrategyEquityPoint]
    triggered_days: list[StrategyDailySignalLogRow]
    daily_signal_log: list[StrategyDailySignalLogRow]
    warning: str | None = None


class StrategyPortfolioMetrics(BaseModel):
    starting_capital: float
    ending_capital: float
    gross_profit: float
    gross_loss: float
    net_pnl: float
    return_pct: float
    total_trades: int
    winning_trades: int
    losing_trades: int
    win_rate_pct: float
    profit_factor: float | None
    max_drawdown_pct: float
    capital_per_instrument: float
    total_brokerage: float
    equity_curve: list[StrategyEquityPoint]


class StrategyBacktestResponse(BaseModel):
    status: Literal["success"]
    mode: str
    strategy_summary: dict[str, Any]
    portfolio: StrategyPortfolioMetrics
    instruments: list[StrategyInstrumentResult]


class StrategyLiveStartRequest(BaseModel):
    session_token: str = Field(min_length=10)
    device_id: str = Field(min_length=3, max_length=128)
    environment: Environment
    strategy: dict[str, Any]


class StrategyLiveAlert(BaseModel):
    id: str
    instrument: str
    event: str
    candle_time_ist: str
    triggered_at_ist: str
    price: float
    detail: str


class StrategyLivePosition(BaseModel):
    instrument: str
    quantity: int
    entry_side: str
    entry_price: float
    entry_time_ist: str
    entry_order_id: int | None
    entry_order_status: str | None


class StrategyLiveStatusResponse(BaseModel):
    running: bool
    environment: Environment | None
    instruments: list[str]
    interval: Interval | None
    entry_side: Literal["BUY", "SELL"] | None
    market_status: str
    last_run_ist: str | None
    next_run_ist: str | None
    last_signal: str | None
    last_error: str | None
    alerts: list[StrategyLiveAlert]
    positions: dict[str, StrategyLivePosition]


class StrategyLiveStartResponse(BaseModel):
    status: Literal["success"]
    message: str
    job: StrategyLiveStatusResponse


class StrategyLiveStopResponse(BaseModel):
    status: Literal["success"]
    message: str


class VolumeBreakoutStartRequest(BaseModel):
    session_token: str = Field(min_length=10)
    device_id: str = Field(min_length=3, max_length=128)
    environment: Environment
    universe_slug: str = Field(default="volume-dashboard-liquidity-top300", min_length=3, max_length=128)
    universe_mode: VolumeUniverseMode = "top300"
    interval: Interval = "5m"
    lookback_days: int = Field(default=10, ge=3, le=20)
    refresh_seconds: int = Field(default=30, ge=15, le=300)
    min_volume_ratio: float = Field(default=1.5, ge=1.0, le=20.0)
    limit: int = Field(default=20, ge=5, le=50)
    universe_limit: int = Field(default=300, ge=20, le=300)


class VolumeBreakoutStockRow(BaseModel):
    symbol: str
    display_name: str
    exchange: str
    sector: str | None = None
    industry: str | None = None
    candle_time_ist: str
    last_price: float
    current_volume: float
    average_volume: float
    volume_ratio: float
    price_change_pct: float | None
    day_change_pct: float | None
    price_breakout_pct: float | None
    is_green: bool
    is_price_breakout: bool
    meets_breakout: bool
    baseline_days: int
    # Structure intelligence — populated by scanner for positioning engines
    above_vwap: bool | None = None
    vwap_relation: str | None = None   # accepted_above|testing_above|testing_below|accepted_below|unavailable
    structure_phase: str | None = None  # momentum_continuation|compression|structure_break|range_rotation|grinding_higher|grinding_lower|insufficient


class VolumeBreakoutSummary(BaseModel):
    tracked_stocks: int
    active_breakouts: int
    fresh_breakouts: int
    leaders_with_price_breakout: int
    latest_candle_ist: str | None
    market_status: str


class VolumeBreakoutSyncStatus(BaseModel):
    db_enabled: bool
    cache_mode: Literal["database", "memory"]
    universe_ready: bool
    symbols_synced: int
    symbols_missing_history: int
    history_range_ist: str | None
    last_history_sync_ist: str | None
    next_refresh_ist: str | None


class VolumeBreakoutStatusResponse(BaseModel):
    running: bool
    universe_slug: str
    universe_mode: VolumeUniverseMode
    universe_label: str
    interval: Interval
    lookback_days: int
    refresh_seconds: int
    min_volume_ratio: float
    universe_size: int
    sync: VolumeBreakoutSyncStatus
    last_run_ist: str | None
    next_run_ist: str | None
    last_error: str | None
    summary: VolumeBreakoutSummary
    market_breakouts: list[VolumeBreakoutStockRow]
    recent_breakouts: list[VolumeBreakoutStockRow]
    confirmed_breakouts: list[VolumeBreakoutStockRow]
    movers_up: list[VolumeBreakoutStockRow]
    movers_down: list[VolumeBreakoutStockRow]
    sector_heatmap_rows: list[VolumeBreakoutStockRow] = Field(default_factory=list)
    # Full scanned universe — every symbol that passed the scan this cycle (no breakout filter).
    # Used by positioning engines to compute unbiased breadth and participation metrics.
    all_scanned_rows: list[VolumeBreakoutStockRow] = Field(default_factory=list)
    is_cached_snapshot: bool = False
    hydration_state: str = "cold"
    active_consumers: int = 0
    retained_consumers: int = 0
    event_subscribers: int = 0
    restored_from_snapshot: bool = False
    idle_reason: str | None = None


class VolumeBreakoutDrilldownPoint(BaseModel):
    time_ist: str
    epoch_ms: int | None = None
    open: float | None = None
    high: float | None = None
    low: float | None = None
    close: float
    volume: float
    session_vwap: float | None = None
    is_partial: bool = False


class VolumeBreakoutDrilldownRequest(VolumeBreakoutStartRequest):
    symbol: str = Field(min_length=1, max_length=64)
    points: int = Field(default=36, ge=12, le=96)


class VolumeBreakoutDrilldownResponse(BaseModel):
    symbol: str
    display_name: str
    exchange: str
    sector: str | None = None
    interval: Interval
    latest_candle_ist: str | None
    baseline_average_volume: float | None
    vwap: dict[str, Any] = Field(default_factory=dict)
    opening_ranges: dict[str, Any] = Field(default_factory=dict)
    structure: dict[str, Any] = Field(default_factory=dict)
    points: list[VolumeBreakoutDrilldownPoint]


class PositioningCandlesRequest(BaseModel):
    session_token: str = Field(min_length=10)
    device_id: str = Field(min_length=3, max_length=128)
    environment: Environment
    symbol: str = Field(min_length=1, max_length=64)
    exchange: str = Field(default="NSE", min_length=1, max_length=16)


class PositioningCandlesResponse(BaseModel):
    symbol: str
    exchange: str
    interval: str = "1m"
    points: list[VolumeBreakoutDrilldownPoint]


class PositioningIndexCandlesRequest(BaseModel):
    session_token: str = Field(min_length=10)
    device_id: str = Field(min_length=3, max_length=128)
    environment: Environment
    underlying: str = Field(default="NIFTY", min_length=1, max_length=32)


class PositioningIndexCandlesResponse(BaseModel):
    underlying: str
    interval: str = "1m"
    points: list[VolumeBreakoutDrilldownPoint]
    is_stale: bool = False
    session_date: str | None = None
    fetch_error: str | None = None


class OptionChainStrikeRow(BaseModel):
    strike_price: int
    distance_from_spot: int
    is_atm: bool
    ce_ref_id: int | None = None
    ce_oi: float | None = None
    ce_oi_change: float | None = None
    ce_iv: float | None = None
    ce_ltp: float | None = None
    ce_delta: float | None = None
    ce_gamma: float | None = None
    ce_theta: float | None = None
    ce_vega: float | None = None
    ce_volume: float | None = None
    pe_ref_id: int | None = None
    pe_oi: float | None = None
    pe_oi_change: float | None = None
    pe_iv: float | None = None
    pe_ltp: float | None = None
    pe_delta: float | None = None
    pe_gamma: float | None = None
    pe_theta: float | None = None
    pe_vega: float | None = None
    pe_volume: float | None = None


class PositioningOptionCandlesRequest(BaseModel):
    session_token: str = Field(min_length=10)
    device_id: str = Field(min_length=3, max_length=128)
    environment: Environment
    underlying: str = Field(min_length=1, max_length=32)
    strike_price: float
    option_type: str = Field(min_length=2, max_length=2)
    expiry: str | None = None


class PositioningIntradayBootstrapRequest(BaseModel):
    session_token: str = Field(min_length=10)
    device_id: str = Field(min_length=3, max_length=128)
    environment: Environment
    max_symbols: int = Field(default=100, ge=10, le=200)


class PositioningIntradayBootstrapResponse(BaseModel):
    injected: int
    total_fetched: int
    symbols_attempted: int
    duration_ms: int
    session_date: str


class PositioningOptionChainRequest(BaseModel):
    session_token: str = Field(min_length=10)
    device_id: str = Field(min_length=3, max_length=128)
    environment: Environment
    underlying: str = Field(default="NIFTY", min_length=1, max_length=32)
    expiry: str | None = None


class PositioningOptionChainResponse(BaseModel):
    underlying: str
    spot_price: float | None
    atm_strike: int | None
    expiry: str | None
    pcr: float | None
    max_pain: int | None
    straddle_price: float | None
    total_ce_oi: float | None
    total_pe_oi: float | None
    strikes: list[OptionChainStrikeRow]
    fetched_at: str
    market_closed: bool = False
    lot_size: int = 1


# ── Options Intelligence Engine (OIE) ────────────────────────────────────────

class OIEChainRequest(BaseModel):
    session_token: str = Field(min_length=10)
    device_id: str = Field(min_length=3, max_length=128)
    environment: Environment
    underlying: str = Field(default="NIFTY", min_length=1, max_length=32)
    expiry: str | None = None


class OIEChainStrikeRow(BaseModel):
    strike_price: int
    distance_from_spot: int
    is_atm: bool
    # CE side
    ce_ref_id: int | None = None
    ce_oi: float | None = None
    ce_oi_change: float | None = None
    ce_iv: float | None = None
    ce_ltp: float | None = None
    ce_delta: float | None = None
    ce_gamma: float | None = None
    ce_theta: float | None = None
    ce_vega: float | None = None
    ce_volume: float | None = None
    ce_gex: float | None = None
    # PE side
    pe_ref_id: int | None = None
    pe_oi: float | None = None
    pe_oi_change: float | None = None
    pe_iv: float | None = None
    pe_ltp: float | None = None
    pe_delta: float | None = None
    pe_gamma: float | None = None
    pe_theta: float | None = None
    pe_vega: float | None = None
    pe_volume: float | None = None
    pe_gex: float | None = None
    # Per-strike net
    net_gex: float | None = None


class OIEGreeksAggregates(BaseModel):
    lot_size: int = 1
    net_delta: float | None = None
    net_gamma: float | None = None
    net_vega: float | None = None
    net_theta: float | None = None
    total_gex: float | None = None
    gamma_flip_level: int | None = None
    call_wall: int | None = None
    put_wall: int | None = None
    gex_bias: str = "neutral"
    ce_gex_total: float | None = None
    pe_gex_total: float | None = None


class OIEChainResponse(BaseModel):
    underlying: str
    spot_price: float | None = None
    atm_strike: int | None = None
    expiry: str | None = None
    lot_size: int = 1
    pcr: float | None = None
    max_pain: int | None = None
    straddle_price: float | None = None
    total_ce_oi: float | None = None
    total_pe_oi: float | None = None
    strikes: list[OIEChainStrikeRow] = Field(default_factory=list)
    aggregates: OIEGreeksAggregates
    fetched_at: str
    market_closed: bool = False


class OIEAnalyticsRequest(BaseModel):
    session_token: str = Field(min_length=10)
    device_id: str = Field(min_length=3, max_length=128)
    environment: Environment
    underlying: str = Field(default="NIFTY", min_length=1, max_length=32)
    expiry: str | None = None


class OIEAnalyticsResponse(BaseModel):
    underlying: str
    spot_price: float | None = None
    fetched_at: str
    metrics: dict[str, Any] = Field(default_factory=dict)


class OIEIntelligenceRequest(BaseModel):
    session_token: str = Field(min_length=10)
    device_id: str = Field(min_length=3, max_length=128)
    environment: Environment
    underlying: str = Field(default="NIFTY", min_length=1, max_length=32)
    expiry: str | None = None


class OIEIntelligenceResponse(BaseModel):
    underlying: str
    spot_price: float | None = None
    atm_strike: int | None = None
    fetched_at: str
    market_bias: str = "Neutral"
    confidence_score: float = 50.0
    volatility_regime: str = "Normal"
    gamma_regime: str = "Neutral"
    dealer_positioning: str = "Neutral"
    expected_move_daily: str = "N/A"
    expected_move_weekly: str = "N/A"
    option_seller_favorability: str = "Medium"
    key_levels: dict[str, Any] = Field(default_factory=dict)
    interpretation_bullets: list[str] = Field(default_factory=list)
    metric_summary: dict[str, str] = Field(default_factory=dict)
    metrics: dict[str, Any] = Field(default_factory=dict)


class VolumeBreakoutStartResponse(BaseModel):
    status: str
    message: str
    job: VolumeBreakoutStatusResponse


class VolumeBreakoutStopResponse(BaseModel):
    status: str
    message: str


class MarketStatusResponse(BaseModel):
    is_open: bool
    reason: str
    last_session_date: str
    next_open_ist: str
    current_ist: str


class PositioningPositionsRequest(BaseModel):
    session_token: str = Field(min_length=10)
    device_id: str = Field(min_length=3, max_length=128)
    environment: Environment

class PositioningPositionItem(BaseModel):
    ref_id: int
    display_name: str
    underlying: str
    strike_price: float | None = None  # rupees
    option_type: str | None = None     # CE or PE
    lot_size: int
    qty: int
    avg_price: float   # rupees
    ltp: float         # rupees
    pnl: float         # rupees
    pnl_pct: float | None = None
    product: str       # ORDER_DELIVERY_TYPE_CNC etc
    side: str          # BUY / SELL
    expiry: str | None = None
    zanskar_name: str | None = None

class PositioningPositionsResponse(BaseModel):
    positions: list[PositioningPositionItem]
    total_pnl: float

class PositioningOrdersRequest(BaseModel):
    session_token: str = Field(min_length=10)
    device_id: str = Field(min_length=3, max_length=128)
    environment: Environment

class PositioningOrderItem(BaseModel):
    order_id: int
    ref_id: int
    display_name: str
    order_side: str      # ORDER_SIDE_BUY / SELL
    order_status: str
    order_price: float   # rupees
    order_qty: int
    order_delivery_type: str
    tag: str | None = None
    order_time: int | None = None   # epoch ns

class PositioningOrdersResponse(BaseModel):
    orders: list[PositioningOrderItem]

class PositioningExitRequest(BaseModel):
    session_token: str = Field(min_length=10)
    device_id: str = Field(min_length=3, max_length=128)
    environment: Environment
    ref_id: int
    display_name: str
    option_leg: Literal["CE", "PE"] = "CE"
    exit_side: Literal["ORDER_SIDE_BUY", "ORDER_SIDE_SELL"]
    qty: int = Field(ge=1)
    lot_size: int = Field(ge=1)
    ltp: float = Field(gt=0)
    order_delivery_type: Literal["ORDER_DELIVERY_TYPE_CNC", "ORDER_DELIVERY_TYPE_IDAY", "ORDER_DELIVERY_TYPE_NRML"] = "ORDER_DELIVERY_TYPE_CNC"

class PositioningExitResponse(BaseModel):
    status: Literal["success"]
    message: str
    order_id: int | None
    order_status: str | None


class SmcSnapshotRequest(BaseModel):
    session_token: str = Field(min_length=10)
    device_id: str = Field(min_length=3, max_length=128)
    environment: Environment
    symbol: str = Field(default="NIFTY", min_length=1, max_length=32)
    exchange: str = Field(default="NSE", min_length=1, max_length=10)
    interval: str = Field(default="5", min_length=1, max_length=5)


class SmcScanRequest(BaseModel):
    session_token: str = Field(min_length=10)
    device_id: str = Field(min_length=3, max_length=128)
    environment: Environment
    symbols: list[str] = Field(default_factory=lambda: ["NIFTY", "BANKNIFTY", "FINNIFTY"])
    exchange: str = Field(default="NSE", min_length=1, max_length=10)
    interval: str = Field(default="5", min_length=1, max_length=5)
