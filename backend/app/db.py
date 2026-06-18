from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from app.config import get_sqlite_db_path


UTC = timezone.utc


@dataclass(frozen=True, slots=True)
class SyncRunResult:
    status: str
    started_at: datetime
    finished_at: datetime
    entity: str
    row_count: int
    details: dict[str, Any]


SCHEMA_SQL = """
create table if not exists instruments (
    symbol text not null,
    display_name text not null,
    exchange text not null,
    ref_id integer not null,
    tick_size integer not null,
    lot_size integer not null,
    instrument_type text not null,
    is_active integer not null default 1,
    source text not null,
    raw_json text not null default '{}',
    created_at text not null,
    updated_at text not null,
    primary key (symbol, exchange)
);

create table if not exists dashboard_universes (
    slug text primary key,
    title text not null,
    description text,
    created_at text not null,
    updated_at text not null
);

create table if not exists dashboard_universe_members (
    universe_slug text not null,
    symbol text not null,
    exchange text not null,
    sector text,
    industry text,
    sort_order integer not null default 0,
    is_active integer not null default 1,
    created_at text not null,
    updated_at text not null,
    primary key (universe_slug, symbol, exchange)
);

create index if not exists idx_dashboard_universe_members_universe_sort
    on dashboard_universe_members(universe_slug, sort_order asc, symbol asc);

create table if not exists stock_taxonomy (
    symbol text not null,
    exchange text not null,
    sector text,
    industry text,
    notes_json text not null default '{}',
    created_at text not null,
    updated_at text not null,
    primary key (symbol, exchange)
);

create table if not exists stock_liquidity_ranks (
    as_of_date text not null,
    symbol text not null,
    exchange text not null,
    rank integer not null,
    liquidity_score real not null,
    avg_traded_value_20d real not null,
    median_traded_value_20d real not null,
    avg_volume_20d real not null,
    active_days integer not null,
    last_close real,
    source text not null,
    created_at text not null,
    updated_at text not null,
    primary key (as_of_date, symbol, exchange)
);

create index if not exists idx_stock_liquidity_ranks_date_rank
    on stock_liquidity_ranks(as_of_date desc, exchange, rank asc);

create table if not exists ohlcv_1m_bars (
    symbol text not null,
    exchange text not null,
    bucket_timestamp text not null,
    open_price real not null,
    high_price real not null,
    low_price real not null,
    close_price real not null,
    bucket_volume real,
    cumulative_volume real,
    source text not null,
    raw_json text not null default '{}',
    created_at text not null,
    updated_at text not null,
    primary key (symbol, exchange, bucket_timestamp)
);

create index if not exists idx_ohlcv_1m_bars_symbol_ts
    on ohlcv_1m_bars(symbol, exchange, bucket_timestamp desc);

create table if not exists sync_runs (
    id integer primary key autoincrement,
    started_at text not null,
    finished_at text not null,
    status text not null,
    entity text not null,
    row_count integer not null,
    details_json text not null
);

create table if not exists volume_dashboard_snapshots (
    universe_slug text not null,
    interval text not null,
    lookback_days integer not null,
    min_volume_ratio real not null,
    created_at text not null,
    payload_json text not null,
    primary key (universe_slug, interval, lookback_days, min_volume_ratio)
);

create index if not exists idx_volume_dashboard_snapshots_created
    on volume_dashboard_snapshots(created_at desc);

create table if not exists positioning_snapshots (
    id integer primary key autoincrement,
    universe text not null,
    created_at text not null,
    seq integer not null,
    status text not null,
    payload_json text not null
);

create index if not exists idx_positioning_snapshots_universe_created
    on positioning_snapshots(universe, created_at desc);

create table if not exists positioning_latest_snapshots (
    universe text primary key,
    updated_at text not null,
    seq integer not null,
    status text not null,
    payload_json text not null
);

create table if not exists positioning_alert_history (
    id text primary key,
    created_at text not null,
    severity text not null,
    source text not null,
    title text not null,
    message text not null,
    payload_json text not null default '{}'
);

create index if not exists idx_positioning_alert_history_created
    on positioning_alert_history(created_at desc);

create table if not exists positioning_option_pressure_snapshots (
    id text primary key,
    created_at text not null,
    seq integer not null,
    underlying text not null,
    call_pressure real not null,
    put_pressure real not null,
    payload_json text not null
);

create index if not exists idx_positioning_option_pressure_created
    on positioning_option_pressure_snapshots(created_at desc, underlying);

create table if not exists range_trader_setups (
    id text primary key,
    account_id text not null,
    environment text not null,
    title text not null,
    symbol text not null,
    display_name text not null,
    exchange text not null,
    instrument_type text not null,
    derivative_type text,
    option_type text,
    expiry text,
    strike_price real,
    ref_id integer not null,
    tick_size integer not null,
    lot_size integer not null,
    timeframe text not null,
    side text not null,
    quantity integer not null,
    order_type text not null,
    tolerance_value real not null,
    tolerance_mode text not null,
    max_loss real,
    exit_on_max_loss integer not null default 1,
    status text not null,
    created_at text not null,
    updated_at text not null,
    payload_json text not null default '{}'
);

create index if not exists idx_range_trader_setups_account_updated
    on range_trader_setups(account_id, environment, updated_at desc);

create table if not exists range_trader_events (
    id text primary key,
    setup_id text not null,
    account_id text not null,
    environment text not null,
    created_at text not null,
    level text not null,
    event_type text not null,
    message text not null,
    payload_json text not null default '{}'
);

create index if not exists idx_range_trader_events_setup_created
    on range_trader_events(setup_id, created_at desc);

-- Options Intelligence Engine tables
create table if not exists oie_chain_snapshots (
    id integer primary key autoincrement,
    underlying text not null,
    expiry text,
    environment text not null,
    created_at text not null,
    spot_price real,
    total_gex real,
    gamma_flip real,
    gamma_flip_level integer,
    pcr real,
    max_pain real,
    gex_bias text,
    payload_json text not null default '{}'
);

create index if not exists idx_oie_chain_snapshots_underlying_created
    on oie_chain_snapshots(underlying, created_at desc);

create index if not exists idx_oie_chain_snapshots_env_created
    on oie_chain_snapshots(underlying, environment, created_at desc);

create table if not exists oie_strategies (
    id text primary key,
    name text not null,
    underlying text not null default 'NIFTY',
    description text,
    entry_conditions_json text not null default '[]',
    exit_conditions_json text not null default '[]',
    action text not null default 'alert',
    is_active integer not null default 1,
    created_at text not null,
    updated_at text not null
);

create table if not exists oie_alerts (
    id text primary key,
    strategy_id text,
    underlying text not null,
    environment text not null default 'PROD',
    created_at text not null,
    severity text not null default 'info',
    title text not null,
    message text not null,
    match_score real,
    matched_count integer,
    total_count integer,
    payload_json text not null default '{}'
);

create index if not exists idx_oie_alerts_created
    on oie_alerts(created_at desc);

create index if not exists idx_oie_alerts_strategy
    on oie_alerts(strategy_id, created_at desc);

create index if not exists idx_oie_alerts_underlying_env
    on oie_alerts(underlying, environment, created_at desc);

create table if not exists oie_iv_history (
    id integer primary key autoincrement,
    underlying text not null,
    expiry text,
    environment text not null,
    recorded_at text not null,
    atm_iv real,
    atm_strike integer,
    iv_percentile real,
    iv_rank real,
    payload_json text not null default '{}'
);

create index if not exists idx_oie_iv_history_underlying_recorded
    on oie_iv_history(underlying, recorded_at desc);

create index if not exists idx_oie_iv_history_env_recorded
    on oie_iv_history(underlying, environment, recorded_at desc);

create unique index if not exists idx_oie_iv_history_unique
    on oie_iv_history(underlying, environment, expiry, recorded_at);

create table if not exists oie_signal_snapshots (
    id text primary key,
    underlying text not null,
    environment text not null,
    generated_at text not null,
    composite_direction text not null,
    composite_score real not null,
    bull_score real not null default 0,
    bear_score real not null default 0,
    summary text not null default '',
    signals_json text not null default '[]'
);

create index if not exists idx_oie_signal_snapshots_underlying
    on oie_signal_snapshots(underlying, generated_at desc);

create table if not exists oie_risk_profiles (
    id text primary key,
    underlying text not null,
    environment text not null,
    updated_at text not null,
    max_loss_per_trade real not null default 5000,
    max_daily_loss real not null default 15000,
    position_size_lots integer not null default 1,
    stop_loss_pct real not null default 25,
    target_pct real not null default 50,
    time_stop_minutes integer not null default 60,
    circuit_breaker_enabled integer not null default 1,
    circuit_breaker_max_losses integer not null default 3,
    circuit_breaker_daily_floor real not null default -15000,
    automation_enabled integer not null default 0
);

create table if not exists oie_execution_log (
    id text primary key,
    underlying text not null,
    environment text not null,
    executed_at text not null,
    signal_direction text,
    strike_price real,
    option_type text,
    order_side text,
    lots integer,
    order_qty integer,
    ltp_price real,
    limit_price real,
    estimated_value real,
    order_id integer,
    order_status text,
    instrument_display_name text,
    status text not null default 'pending',
    error_message text,
    payload_json text not null default '{}'
);

create index if not exists idx_oie_execution_log_underlying_executed
    on oie_execution_log(underlying, executed_at desc);
"""


def connect_db() -> sqlite3.Connection:
    db_path = get_sqlite_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(str(db_path))
    connection.row_factory = sqlite3.Row
    initialize_schema(connection)
    return connection


# Alias used by OIE engines
get_db_connection = connect_db


def initialize_schema(connection: sqlite3.Connection) -> None:
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA synchronous=NORMAL")
    connection.executescript(SCHEMA_SQL)
    connection.commit()


def apply_schema(connection: sqlite3.Connection, schema_path: Path) -> None:
    schema_sql = schema_path.read_text(encoding="utf-8")
    connection.executescript(schema_sql)
    connection.commit()


def _fetch_all_dicts(cursor: sqlite3.Cursor) -> list[dict[str, Any]]:
    rows = cursor.fetchall()
    return [dict(row) for row in rows]


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _serialize_json(value: Any) -> str:
    return json.dumps(value if value is not None else {})


def upsert_instruments(connection: sqlite3.Connection, rows: Iterable[dict[str, Any]]) -> int:
    payload = list(rows)
    if not payload:
        return 0
    now = _utc_now_iso()
    prepared = []
    for row in payload:
        prepared.append(
            {
                **row,
                "raw_json": row.get("raw_json") if isinstance(row.get("raw_json"), str) else _serialize_json(row.get("raw_json")),
                "created_at": now,
                "updated_at": now,
            }
        )
    connection.executemany(
        """
        insert into instruments (
            symbol, display_name, exchange, ref_id, tick_size, lot_size, instrument_type,
            is_active, source, raw_json, created_at, updated_at
        )
        values (
            :symbol, :display_name, :exchange, :ref_id, :tick_size, :lot_size, :instrument_type,
            :is_active, :source, :raw_json, :created_at, :updated_at
        )
        on conflict(symbol, exchange) do update set
            display_name = excluded.display_name,
            ref_id = excluded.ref_id,
            tick_size = excluded.tick_size,
            lot_size = excluded.lot_size,
            instrument_type = excluded.instrument_type,
            is_active = excluded.is_active,
            source = excluded.source,
            raw_json = excluded.raw_json,
            updated_at = excluded.updated_at
        """,
        prepared,
    )
    connection.commit()
    return len(prepared)


def upsert_dashboard_universe(connection: sqlite3.Connection, *, slug: str, title: str, description: str | None = None) -> None:
    now = _utc_now_iso()
    connection.execute(
        """
        insert into dashboard_universes (slug, title, description, created_at, updated_at)
        values (?, ?, ?, ?, ?)
        on conflict(slug) do update set
            title = excluded.title,
            description = excluded.description,
            updated_at = excluded.updated_at
        """,
        (slug, title, description, now, now),
    )
    connection.commit()


def upsert_dashboard_universe_members(
    connection: sqlite3.Connection,
    *,
    universe_slug: str,
    rows: Iterable[dict[str, Any]],
) -> int:
    payload = list(rows)
    if not payload:
        return 0
    now = _utc_now_iso()
    prepared = [{**row, "created_at": now, "updated_at": now} for row in payload]
    connection.executemany(
        """
        insert into dashboard_universe_members (
            universe_slug, symbol, exchange, sector, industry, sort_order, is_active, created_at, updated_at
        )
        values (
            :universe_slug, :symbol, :exchange, :sector, :industry, :sort_order, :is_active, :created_at, :updated_at
        )
        on conflict(universe_slug, symbol, exchange) do update set
            sector = excluded.sector,
            industry = excluded.industry,
            sort_order = excluded.sort_order,
            is_active = excluded.is_active,
            updated_at = excluded.updated_at
        """,
        prepared,
    )
    connection.commit()
    return len(prepared)


def replace_dashboard_universe_members(
    connection: sqlite3.Connection,
    *,
    universe_slug: str,
    rows: Iterable[dict[str, Any]],
) -> int:
    connection.execute(
        """
        delete from dashboard_universe_members
        where universe_slug = ?
        """,
        (universe_slug,),
    )
    connection.commit()
    return upsert_dashboard_universe_members(connection, universe_slug=universe_slug, rows=rows)


def upsert_stock_taxonomy(connection: sqlite3.Connection, rows: Iterable[dict[str, Any]]) -> int:
    payload = list(rows)
    if not payload:
        return 0
    now = _utc_now_iso()
    prepared = []
    for row in payload:
        prepared.append(
            {
                **row,
                "notes_json": row.get("notes_json") if isinstance(row.get("notes_json"), str) else _serialize_json(row.get("notes_json")),
                "created_at": now,
                "updated_at": now,
            }
        )
    connection.executemany(
        """
        insert into stock_taxonomy (
            symbol, exchange, sector, industry, notes_json, created_at, updated_at
        )
        values (
            :symbol, :exchange, :sector, :industry, :notes_json, :created_at, :updated_at
        )
        on conflict(symbol, exchange) do update set
            sector = excluded.sector,
            industry = excluded.industry,
            notes_json = excluded.notes_json,
            updated_at = excluded.updated_at
        """,
        prepared,
    )
    connection.commit()
    return len(prepared)


def upsert_stock_liquidity_ranks(connection: sqlite3.Connection, rows: Iterable[dict[str, Any]]) -> int:
    payload = list(rows)
    if not payload:
        return 0
    now = _utc_now_iso()
    prepared = [{**row, "created_at": now, "updated_at": now} for row in payload]
    connection.executemany(
        """
        insert into stock_liquidity_ranks (
            as_of_date, symbol, exchange, rank, liquidity_score,
            avg_traded_value_20d, median_traded_value_20d, avg_volume_20d,
            active_days, last_close, source, created_at, updated_at
        )
        values (
            :as_of_date, :symbol, :exchange, :rank, :liquidity_score,
            :avg_traded_value_20d, :median_traded_value_20d, :avg_volume_20d,
            :active_days, :last_close, :source, :created_at, :updated_at
        )
        on conflict(as_of_date, symbol, exchange) do update set
            rank = excluded.rank,
            liquidity_score = excluded.liquidity_score,
            avg_traded_value_20d = excluded.avg_traded_value_20d,
            median_traded_value_20d = excluded.median_traded_value_20d,
            avg_volume_20d = excluded.avg_volume_20d,
            active_days = excluded.active_days,
            last_close = excluded.last_close,
            source = excluded.source,
            updated_at = excluded.updated_at
        """,
        prepared,
    )
    connection.commit()
    return len(prepared)


def load_stock_liquidity_ranks(
    connection: sqlite3.Connection,
    *,
    exchange: str,
    as_of_date: str,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    latest_cursor = connection.execute(
        """
        select max(as_of_date) as latest_date
        from stock_liquidity_ranks
        where exchange = ?
          and as_of_date <= ?
        """,
        (exchange, as_of_date),
    )
    latest_date = latest_cursor.fetchone()["latest_date"]
    if not latest_date:
        return []

    sql = """
        select
            as_of_date,
            symbol,
            exchange,
            rank,
            liquidity_score,
            avg_traded_value_20d,
            median_traded_value_20d,
            avg_volume_20d,
            active_days,
            last_close,
            source
        from stock_liquidity_ranks
        where exchange = ?
          and as_of_date = ?
        order by rank asc
    """
    params: tuple[Any, ...]
    if limit is not None:
        sql += " limit ?"
        params = (exchange, latest_date, limit)
    else:
        params = (exchange, latest_date)
    cursor = connection.execute(sql, params)
    return _fetch_all_dicts(cursor)


def load_existing_instruments(
    connection: sqlite3.Connection,
    *,
    exchanges: Iterable[str] | None = None,
) -> dict[tuple[str, str], dict[str, Any]]:
    chosen_exchanges = tuple(dict.fromkeys(exchange.strip().upper() for exchange in (exchanges or ()) if exchange))
    if chosen_exchanges:
        placeholders = ",".join("?" for _ in chosen_exchanges)
        cursor = connection.execute(
            f"""
            select symbol, display_name, exchange, ref_id, tick_size, lot_size, instrument_type, is_active
            from instruments
            where exchange in ({placeholders})
            """,
            chosen_exchanges,
        )
    else:
        cursor = connection.execute(
            """
            select symbol, display_name, exchange, ref_id, tick_size, lot_size, instrument_type, is_active
            from instruments
            """
        )
    rows = _fetch_all_dicts(cursor)
    return {(row["symbol"], row["exchange"]): dict(row) for row in rows}


def upsert_ohlcv_1m_bars(connection: sqlite3.Connection, rows: Iterable[dict[str, Any]]) -> int:
    payload = list(rows)
    if not payload:
        return 0
    now = _utc_now_iso()
    prepared = []
    for row in payload:
        bucket_timestamp = row["bucket_timestamp"]
        if isinstance(bucket_timestamp, datetime):
            bucket_timestamp = _ensure_utc(bucket_timestamp).isoformat()
        prepared.append(
            {
                **row,
                "bucket_timestamp": bucket_timestamp,
                "raw_json": row.get("raw_json") if isinstance(row.get("raw_json"), str) else _serialize_json(row.get("raw_json")),
                "created_at": now,
                "updated_at": now,
            }
        )
    connection.executemany(
        """
        insert into ohlcv_1m_bars (
            symbol, exchange, bucket_timestamp, open_price, high_price, low_price, close_price,
            bucket_volume, cumulative_volume, source, raw_json, created_at, updated_at
        )
        values (
            :symbol, :exchange, :bucket_timestamp, :open_price, :high_price, :low_price, :close_price,
            :bucket_volume, :cumulative_volume, :source, :raw_json, :created_at, :updated_at
        )
        on conflict(symbol, exchange, bucket_timestamp) do update set
            open_price = excluded.open_price,
            high_price = excluded.high_price,
            low_price = excluded.low_price,
            close_price = excluded.close_price,
            bucket_volume = excluded.bucket_volume,
            cumulative_volume = excluded.cumulative_volume,
            source = excluded.source,
            raw_json = excluded.raw_json,
            updated_at = excluded.updated_at
        """,
        prepared,
    )
    connection.commit()
    return len(prepared)


def load_dashboard_universe_members(
    connection: sqlite3.Connection,
    *,
    universe_slug: str,
) -> list[dict[str, Any]]:
    cursor = connection.execute(
        """
        select
            members.universe_slug,
            members.symbol,
            members.exchange,
            members.sector,
            members.industry,
            members.sort_order,
            members.is_active,
            instruments.display_name
        from dashboard_universe_members as members
        join instruments
          on instruments.symbol = members.symbol
         and instruments.exchange = members.exchange
        where members.universe_slug = ?
          and members.is_active = 1
          and instruments.is_active = 1
        order by members.sort_order asc, members.symbol asc
        """,
        (universe_slug,),
    )
    return _fetch_all_dicts(cursor)


def load_ohlcv_1m_bars(
    connection: sqlite3.Connection,
    *,
    universe_slug: str,
    since_timestamp: datetime,
    symbols: Iterable[str] | None = None,
) -> list[dict[str, Any]]:
    symbol_values = [str(symbol).strip().upper() for symbol in symbols or [] if str(symbol).strip()]
    symbol_filter = ""
    params: list[Any] = [universe_slug, _ensure_utc(since_timestamp).isoformat()]
    if symbol_values:
        placeholders = ",".join("?" for _ in symbol_values)
        symbol_filter = f" and bars.symbol in ({placeholders})"
        params.extend(symbol_values)
    cursor = connection.execute(
        f"""
        select
            bars.symbol,
            bars.exchange,
            bars.bucket_timestamp,
            bars.open_price,
            bars.high_price,
            bars.low_price,
            bars.close_price,
            bars.bucket_volume,
            bars.cumulative_volume
        from ohlcv_1m_bars as bars
        join dashboard_universe_members as members
          on members.symbol = bars.symbol
         and members.exchange = bars.exchange
        where members.universe_slug = ?
          and members.is_active = 1
          and bars.bucket_timestamp >= ?
          {symbol_filter}
        order by bars.symbol asc, bars.bucket_timestamp asc
        """,
        params,
    )
    return _fetch_all_dicts(cursor)


def load_latest_ohlcv_1m_bars(
    connection: sqlite3.Connection,
    *,
    universe_slug: str,
) -> dict[tuple[str, str], datetime]:
    cursor = connection.execute(
        """
        select
            bars.symbol,
            bars.exchange,
            max(bars.bucket_timestamp) as latest_bucket_timestamp
        from ohlcv_1m_bars as bars
        join dashboard_universe_members as members
          on members.symbol = bars.symbol
         and members.exchange = bars.exchange
        where members.universe_slug = ?
          and members.is_active = 1
        group by bars.symbol, bars.exchange
        """,
        (universe_slug,),
    )
    rows = _fetch_all_dicts(cursor)
    latest: dict[tuple[str, str], datetime] = {}
    for row in rows:
        timestamp = row.get("latest_bucket_timestamp")
        if isinstance(timestamp, str) and timestamp:
            latest[(str(row["symbol"]), str(row["exchange"]))] = datetime.fromisoformat(timestamp).astimezone(UTC)
    return latest


def load_ohlcv_1m_bars_delta(
    connection: sqlite3.Connection,
    *,
    universe_slug: str,
    symbol_since: dict[tuple[str, str], datetime],
) -> list[dict[str, Any]]:
    """Load only new bars for each symbol since its last known timestamp (delta loading)."""
    if not symbol_since:
        return []

    deltas: list[dict[str, Any]] = []
    for (symbol, exchange), since_ts in symbol_since.items():
        cursor = connection.execute(
            """
            select
                bars.symbol,
                bars.exchange,
                bars.bucket_timestamp,
                bars.open_price,
                bars.high_price,
                bars.low_price,
                bars.close_price,
                bars.bucket_volume,
                bars.cumulative_volume
            from ohlcv_1m_bars as bars
            join dashboard_universe_members as members
              on members.symbol = bars.symbol
             and members.exchange = bars.exchange
            where members.universe_slug = ?
              and members.is_active = 1
              and bars.symbol = ?
              and bars.exchange = ?
              and bars.bucket_timestamp > ?
            order by bars.bucket_timestamp asc
            """,
            (universe_slug, symbol, exchange, _ensure_utc(since_ts).isoformat()),
        )
        deltas.extend(_fetch_all_dicts(cursor))
    return deltas


def record_sync_run(connection: sqlite3.Connection, result: SyncRunResult) -> None:
    connection.execute(
        """
        insert into sync_runs (started_at, finished_at, status, entity, row_count, details_json)
        values (?, ?, ?, ?, ?, ?)
        """,
        (
            _ensure_utc(result.started_at).isoformat(),
            _ensure_utc(result.finished_at).isoformat(),
            result.status,
            result.entity,
            result.row_count,
            _serialize_json(result.details),
        ),
    )
    connection.commit()


def save_volume_dashboard_snapshot(
    connection: sqlite3.Connection,
    *,
    universe_slug: str,
    interval: str,
    lookback_days: int,
    min_volume_ratio: float,
    payload: dict[str, Any],
) -> None:
    now = _utc_now_iso()
    connection.execute(
        """
        insert into volume_dashboard_snapshots (
            universe_slug, interval, lookback_days, min_volume_ratio, created_at, payload_json
        )
        values (?, ?, ?, ?, ?, ?)
        on conflict(universe_slug, interval, lookback_days, min_volume_ratio) do update set
            created_at = excluded.created_at,
            payload_json = excluded.payload_json
        """,
        (
            universe_slug,
            interval,
            lookback_days,
            min_volume_ratio,
            now,
            _serialize_json(payload),
        ),
    )
    connection.commit()


def load_volume_dashboard_snapshot(
    connection: sqlite3.Connection,
    *,
    universe_slug: str,
    interval: str,
    lookback_days: int,
    min_volume_ratio: float,
) -> dict[str, Any] | None:
    cursor = connection.execute(
        """
        select payload_json
        from volume_dashboard_snapshots
        where universe_slug = ?
          and interval = ?
          and lookback_days = ?
          and min_volume_ratio = ?
        order by created_at desc
        limit 1
        """,
        (universe_slug, interval, lookback_days, min_volume_ratio),
    )
    row = cursor.fetchone()
    if not row:
        return None
    try:
        payload = json.loads(row["payload_json"])
    except (TypeError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def _ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def load_intraday_candles_for_symbol(
    connection: sqlite3.Connection,
    *,
    symbol: str,
    exchange: str,
    since_timestamp: datetime,
) -> list[dict[str, Any]]:
    cursor = connection.execute(
        """
        select
            symbol,
            exchange,
            bucket_timestamp,
            open_price,
            high_price,
            low_price,
            close_price,
            bucket_volume,
            cumulative_volume
        from ohlcv_1m_bars
        where symbol = ?
          and exchange = ?
          and bucket_timestamp >= ?
        order by bucket_timestamp asc
        """,
        [symbol.strip().upper(), exchange.strip().upper(), _ensure_utc(since_timestamp).isoformat()],
    )
    return _fetch_all_dicts(cursor)


def prune_ohlcv_1m_bars(
    connection: sqlite3.Connection,
    *,
    universe_slug: str,
    keep_since: datetime,
) -> int:
    cursor = connection.execute(
        """
        delete from ohlcv_1m_bars
        where (symbol, exchange) in (
            select symbol, exchange from dashboard_universe_members
            where universe_slug = ? and is_active = 1
        )
        and bucket_timestamp < ?
        """,
        (universe_slug, _ensure_utc(keep_since).isoformat()),
    )
    connection.commit()
    return cursor.rowcount


def upsert_range_trader_setup(connection: sqlite3.Connection, setup: dict[str, Any]) -> dict[str, Any]:
    now = _utc_now_iso()
    payload_json = _serialize_json(setup.get("payload") or {})
    prepared = {
        **setup,
        "created_at": setup.get("created_at") or now,
        "updated_at": now,
        "payload_json": payload_json,
        "exit_on_max_loss": 1 if setup.get("exit_on_max_loss", True) else 0,
    }
    connection.execute(
        """
        insert into range_trader_setups (
            id, account_id, environment, title, symbol, display_name, exchange,
            instrument_type, derivative_type, option_type, expiry, strike_price,
            ref_id, tick_size, lot_size, timeframe, side, quantity, order_type,
            tolerance_value, tolerance_mode, max_loss, exit_on_max_loss, status,
            created_at, updated_at, payload_json
        )
        values (
            :id, :account_id, :environment, :title, :symbol, :display_name, :exchange,
            :instrument_type, :derivative_type, :option_type, :expiry, :strike_price,
            :ref_id, :tick_size, :lot_size, :timeframe, :side, :quantity, :order_type,
            :tolerance_value, :tolerance_mode, :max_loss, :exit_on_max_loss, :status,
            :created_at, :updated_at, :payload_json
        )
        on conflict(id) do update set
            title = excluded.title,
            symbol = excluded.symbol,
            display_name = excluded.display_name,
            exchange = excluded.exchange,
            instrument_type = excluded.instrument_type,
            derivative_type = excluded.derivative_type,
            option_type = excluded.option_type,
            expiry = excluded.expiry,
            strike_price = excluded.strike_price,
            ref_id = excluded.ref_id,
            tick_size = excluded.tick_size,
            lot_size = excluded.lot_size,
            timeframe = excluded.timeframe,
            side = excluded.side,
            quantity = excluded.quantity,
            order_type = excluded.order_type,
            tolerance_value = excluded.tolerance_value,
            tolerance_mode = excluded.tolerance_mode,
            max_loss = excluded.max_loss,
            exit_on_max_loss = excluded.exit_on_max_loss,
            status = excluded.status,
            updated_at = excluded.updated_at,
            payload_json = excluded.payload_json
        """,
        prepared,
    )
    connection.commit()
    return load_range_trader_setup(connection, setup_id=str(setup["id"])) or setup


def load_range_trader_setup(connection: sqlite3.Connection, *, setup_id: str) -> dict[str, Any] | None:
    cursor = connection.execute(
        """
        select *
        from range_trader_setups
        where id = ?
        """,
        (setup_id,),
    )
    row = cursor.fetchone()
    return _decode_range_setup(dict(row)) if row else None


def load_range_trader_setups(
    connection: sqlite3.Connection,
    *,
    account_id: str,
    environment: str,
) -> list[dict[str, Any]]:
    cursor = connection.execute(
        """
        select *
        from range_trader_setups
        where account_id = ?
          and environment = ?
        order by updated_at desc
        limit 25
        """,
        (account_id, environment),
    )
    return [_decode_range_setup(dict(row)) for row in cursor.fetchall()]


def update_range_trader_setup_status(
    connection: sqlite3.Connection,
    *,
    setup_id: str,
    account_id: str,
    environment: str,
    status: str,
) -> dict[str, Any] | None:
    connection.execute(
        """
        update range_trader_setups
        set status = ?, updated_at = ?
        where id = ?
          and account_id = ?
          and environment = ?
        """,
        (status, _utc_now_iso(), setup_id, account_id, environment),
    )
    connection.commit()
    return load_range_trader_setup(connection, setup_id=setup_id)


def update_range_trader_setup_payload(
    connection: sqlite3.Connection,
    *,
    setup_id: str,
    account_id: str,
    environment: str,
    payload: dict[str, Any],
    status: str | None = None,
) -> dict[str, Any] | None:
    updated_at = _utc_now_iso()
    if status is None:
        connection.execute(
            """
            update range_trader_setups
            set payload_json = ?, updated_at = ?
            where id = ?
              and account_id = ?
              and environment = ?
            """,
            (_serialize_json(payload), updated_at, setup_id, account_id, environment),
        )
    else:
        connection.execute(
            """
            update range_trader_setups
            set payload_json = ?, status = ?, updated_at = ?
            where id = ?
              and account_id = ?
              and environment = ?
            """,
            (_serialize_json(payload), status, updated_at, setup_id, account_id, environment),
        )
    connection.commit()
    return load_range_trader_setup(connection, setup_id=setup_id)


def append_range_trader_event(connection: sqlite3.Connection, event: dict[str, Any]) -> dict[str, Any]:
    now = _utc_now_iso()
    prepared = {
        **event,
        "created_at": event.get("created_at") or now,
        "payload_json": _serialize_json(event.get("payload") or {}),
    }
    connection.execute(
        """
        insert into range_trader_events (
            id, setup_id, account_id, environment, created_at, level, event_type, message, payload_json
        )
        values (
            :id, :setup_id, :account_id, :environment, :created_at, :level, :event_type, :message, :payload_json
        )
        """,
        prepared,
    )
    connection.commit()
    return prepared


def load_range_trader_events(
    connection: sqlite3.Connection,
    *,
    setup_id: str,
    account_id: str,
    environment: str,
    limit: int = 100,
) -> list[dict[str, Any]]:
    cursor = connection.execute(
        """
        select *
        from range_trader_events
        where setup_id = ?
          and account_id = ?
          and environment = ?
        order by created_at desc
        limit ?
        """,
        (setup_id, account_id, environment, limit),
    )
    rows = []
    for row in cursor.fetchall():
        item = dict(row)
        try:
            item["payload"] = json.loads(item.pop("payload_json") or "{}")
        except (TypeError, json.JSONDecodeError):
            item["payload"] = {}
        rows.append(item)
    return rows


def _decode_range_setup(row: dict[str, Any]) -> dict[str, Any]:
    try:
        payload = json.loads(row.pop("payload_json") or "{}")
    except (TypeError, json.JSONDecodeError):
        payload = {}
    row["payload"] = payload if isinstance(payload, dict) else {}
    row["exit_on_max_loss"] = bool(row.get("exit_on_max_loss"))
    return row
