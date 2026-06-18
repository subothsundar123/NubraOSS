create table if not exists instruments (
    symbol text not null,
    display_name text not null,
    exchange text not null,
    ref_id bigint not null,
    tick_size integer not null,
    lot_size integer not null,
    instrument_type text not null default 'STOCK',
    is_active boolean not null default true,
    source text not null default 'seed',
    raw_json jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    primary key (symbol, exchange)
);

create index if not exists idx_instruments_exchange_symbol
    on instruments(exchange, symbol);

create table if not exists stock_taxonomy (
    symbol text not null,
    exchange text not null default 'NSE',
    sector text,
    industry text,
    notes_json jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    primary key (symbol, exchange),
    foreign key (symbol, exchange) references instruments(symbol, exchange) on delete cascade
);

create table if not exists dashboard_universes (
    slug text primary key,
    title text not null,
    description text,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists dashboard_universe_members (
    universe_slug text not null references dashboard_universes(slug) on delete cascade,
    symbol text not null,
    exchange text not null,
    sector text,
    industry text,
    sort_order integer not null default 0,
    is_active boolean not null default true,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    primary key (universe_slug, symbol, exchange),
    foreign key (symbol, exchange) references instruments(symbol, exchange) on delete cascade
);

create index if not exists idx_dashboard_universe_members_universe_sort
    on dashboard_universe_members(universe_slug, sort_order asc, symbol asc);

create table if not exists ohlcv_1m_bars (
    symbol text not null,
    exchange text not null,
    bucket_timestamp timestamptz not null,
    open_price double precision,
    high_price double precision,
    low_price double precision,
    close_price double precision,
    bucket_volume double precision,
    cumulative_volume double precision,
    source text not null default 'historical',
    raw_json jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    primary key (symbol, exchange, bucket_timestamp),
    foreign key (symbol, exchange) references instruments(symbol, exchange) on delete cascade
);

create index if not exists idx_ohlcv_1m_bars_symbol_ts
    on ohlcv_1m_bars(symbol, exchange, bucket_timestamp desc);

create table if not exists sync_runs (
    id bigserial primary key,
    started_at timestamptz not null,
    finished_at timestamptz not null,
    status text not null,
    entity text not null,
    row_count integer not null default 0,
    details_json jsonb not null default '{}'::jsonb
);

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
    strike_price double precision,
    ref_id bigint not null,
    tick_size integer not null,
    lot_size integer not null,
    timeframe text not null,
    side text not null,
    quantity integer not null,
    order_type text not null,
    tolerance_value double precision not null default 0.05,
    tolerance_mode text not null default 'percent',
    max_loss double precision,
    exit_on_max_loss boolean not null default true,
    status text not null default 'draft',
    payload_json jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_range_trader_setups_account_updated
    on range_trader_setups(account_id, environment, updated_at desc);

create table if not exists range_trader_events (
    id text primary key,
    setup_id text not null references range_trader_setups(id) on delete cascade,
    account_id text not null,
    environment text not null,
    created_at timestamptz not null default timezone('utc', now()),
    level text not null,
    event_type text not null,
    message text not null,
    payload_json jsonb not null default '{}'::jsonb
);

create index if not exists idx_range_trader_events_setup_created
    on range_trader_events(setup_id, created_at desc);
