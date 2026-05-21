from __future__ import annotations

import threading
import time
from typing import Any


class PositioningMarketDataBus:
    """
    Latest-value routing layer between data sources and positioning engines.

    Each key holds the most recent payload from its producer plus the wall-clock
    time it was written. Consumers can check staleness before trusting a value.

    Current keys:
      "volume_breakout_status" — full VolumeBreakoutStatusResponse payload dict,
                                  published by the orchestrator every build cycle.

    Future keys (when MarketRuntimeService exists):
      "index_state", "oi_snapshot", "futures_basis", "session_phase", "expiry_context"
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._latest: dict[str, dict[str, Any]] = {}
        self._timestamps: dict[str, float] = {}  # monotonic time of last write

    def publish_latest(self, key: str, payload: dict[str, Any]) -> None:
        with self._lock:
            self._latest[key] = dict(payload)
            self._timestamps[key] = time.monotonic()

    def latest(self, key: str) -> dict[str, Any] | None:
        with self._lock:
            payload = self._latest.get(key)
            return dict(payload) if payload is not None else None

    def age_seconds(self, key: str) -> float | None:
        """Seconds since this key was last written. None if never written."""
        with self._lock:
            ts = self._timestamps.get(key)
        return (time.monotonic() - ts) if ts is not None else None

    def is_stale(self, key: str, max_age_seconds: float = 60.0) -> bool:
        """True if the key has never been written or was written more than max_age_seconds ago."""
        age = self.age_seconds(key)
        return age is None or age > max_age_seconds

    def status(self) -> dict[str, Any]:
        with self._lock:
            now = time.monotonic()
            ages = {
                key: round(now - ts, 1)
                for key, ts in self._timestamps.items()
            }
        return {
            "latest_keys": sorted(ages.keys()),
            "key_ages_seconds": ages,
            "stale_keys": [k for k, age in ages.items() if age > 60.0],
        }


positioning_market_data_bus = PositioningMarketDataBus()
