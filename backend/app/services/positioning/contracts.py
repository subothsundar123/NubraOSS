from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


Direction = Literal["bullish", "bearish", "neutral", "mixed"]
Regime = Literal["trend_up", "trend_down", "mean_reversion", "range", "volatile_chop", "neutral"]


def utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


class PositioningScore(BaseModel):
    score: float = Field(ge=0, le=100)
    direction: Direction = "neutral"
    confidence: float = Field(default=50, ge=0, le=100)
    components: dict[str, float] = Field(default_factory=dict)
    explanation: list[str] = Field(default_factory=list)
    stale: bool = False
    as_of: str = Field(default_factory=utc_now_iso)


class BreadthSnapshot(BaseModel):
    score: PositioningScore
    advances: int = 0
    declines: int = 0
    unchanged: int = 0
    up_volume: float = 0
    down_volume: float = 0
    participation_pct: float = 0
    leaders: list[dict[str, Any]] = Field(default_factory=list)


class SectorRotationSnapshot(BaseModel):
    score: PositioningScore
    sectors: list[dict[str, Any]] = Field(default_factory=list)
    leadership: list[str] = Field(default_factory=list)
    concentration_score: float = 0


class SentimentSnapshot(BaseModel):
    score: PositioningScore
    label: str = "Neutral"


class RegimeSnapshot(BaseModel):
    score: PositioningScore
    regime: Regime = "neutral"
    label: str = "Neutral"


class SmartMoneySnapshot(BaseModel):
    score: PositioningScore
    candidates: list[dict[str, Any]] = Field(default_factory=list)


class OptionsPressureSnapshot(BaseModel):
    score: PositioningScore
    underlying: str = "NIFTY"
    call_pressure: float = 50
    put_pressure: float = 50
    zones: list[dict[str, Any]] = Field(default_factory=list)


class MarketInternalsSnapshot(BaseModel):
    score: PositioningScore
    control_state: str = "rotational_balance"
    transition_reason: str = "Waiting for internal participation evidence."
    participation: dict[str, Any] = Field(default_factory=dict)
    liquidity: dict[str, Any] = Field(default_factory=dict)
    concentration: dict[str, Any] = Field(default_factory=dict)
    acceptance: dict[str, Any] = Field(default_factory=dict)
    activity: dict[str, Any] = Field(default_factory=dict)
    thrusts: list[dict[str, Any]] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)


class OpportunitySnapshot(BaseModel):
    rows: list[dict[str, Any]] = Field(default_factory=list)
    score: PositioningScore


class CommentaryItem(BaseModel):
    id: str
    severity: Literal["info", "warning", "critical"] = "info"
    title: str
    message: str
    created_at: str = Field(default_factory=utc_now_iso)
    tags: list[str] = Field(default_factory=list)


class AlertItem(BaseModel):
    id: str
    severity: Literal["info", "warning", "critical"] = "info"
    title: str
    message: str
    created_at: str = Field(default_factory=utc_now_iso)
    source: str = "positioning"
    payload: dict[str, Any] = Field(default_factory=dict)


class PositioningSnapshot(BaseModel):
    version: int = 1
    seq: int = 0
    status: Literal["bootstrapping", "ready", "degraded"] = "bootstrapping"
    universe: str = "volume-dashboard-all-nse"
    generated_at: str = Field(default_factory=utc_now_iso)
    market_status: str = "unknown"
    breadth: BreadthSnapshot
    sector_rotation: SectorRotationSnapshot
    sentiment: SentimentSnapshot
    regime: RegimeSnapshot
    smart_money: SmartMoneySnapshot
    options_pressure: OptionsPressureSnapshot
    market_internals: MarketInternalsSnapshot
    opportunities: OpportunitySnapshot
    commentary: list[CommentaryItem] = Field(default_factory=list)
    alerts: list[AlertItem] = Field(default_factory=list)
    feed_health: dict[str, Any] = Field(default_factory=dict)


class PositioningEvent(BaseModel):
    type: str
    seq: int
    channel: str = "positioning.dashboard"
    created_at: str = Field(default_factory=utc_now_iso)
    payload: dict[str, Any] = Field(default_factory=dict)


def neutral_score(message: str, *, stale: bool = False) -> PositioningScore:
    return PositioningScore(
        score=50,
        direction="neutral",
        confidence=35 if stale else 50,
        explanation=[message],
        stale=stale,
    )


def empty_snapshot() -> PositioningSnapshot:
    score = neutral_score("Waiting for enough market data to score positioning.", stale=True)
    return PositioningSnapshot(
        breadth=BreadthSnapshot(score=score),
        sector_rotation=SectorRotationSnapshot(score=score),
        sentiment=SentimentSnapshot(score=score),
        regime=RegimeSnapshot(score=score),
        smart_money=SmartMoneySnapshot(score=score),
        options_pressure=OptionsPressureSnapshot(score=score),
        market_internals=MarketInternalsSnapshot(score=score),
        opportunities=OpportunitySnapshot(score=score),
        commentary=[
            CommentaryItem(
                id="bootstrapping",
                title="Positioning model bootstrapping",
                message="The Phase 1 positioning foundation is online and waiting for scanner/cache data.",
                tags=["system"],
            )
        ],
    )
