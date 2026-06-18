"""
Plugin-based analytics registry for the Options Intelligence Engine.

Each metric class calls `register()` at import time.  Consumers call
`compute_all(chain)` to get a dict of metric_key → MetricResult.

Import order in analytics_engine.py controls which modules register.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

_log = logging.getLogger(__name__)


@dataclass
class MetricResult:
    key: str
    label: str
    value: float | None
    formatted: str
    interpretation: str
    group: str  # "oi" | "volatility" | "greeks" | "dealer"
    trend: str = "neutral"  # "up" | "down" | "neutral"
    raw: dict[str, Any] = field(default_factory=dict)


_REGISTRY: dict[str, type["BaseMetric"]] = {}


class BaseMetric:
    key: str = ""
    label: str = ""
    group: str = ""

    def __init_subclass__(cls, **kwargs: Any) -> None:
        super().__init_subclass__(**kwargs)
        if cls.key:
            _REGISTRY[cls.key] = cls

    def compute(self, ctx: "AnalyticsContext") -> MetricResult:
        raise NotImplementedError


@dataclass
class AnalyticsContext:
    """All inputs available to every metric."""
    chain: Any  # OIEChainResponse
    iv_history: list[dict[str, Any]] = field(default_factory=list)   # from oie_iv_history table
    chain_history: list[dict[str, Any]] = field(default_factory=list) # from oie_chain_snapshots


def compute_all(ctx: AnalyticsContext) -> dict[str, MetricResult]:
    results: dict[str, MetricResult] = {}
    for key, cls in _REGISTRY.items():
        try:
            results[key] = cls().compute(ctx)
        except Exception as exc:
            _log.warning("Metric %s failed: %s", key, exc, exc_info=True)
    return results


def get_registry() -> dict[str, type[BaseMetric]]:
    return dict(_REGISTRY)
