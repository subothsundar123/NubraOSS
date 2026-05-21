from __future__ import annotations

import threading
from dataclasses import dataclass, field


@dataclass(frozen=True, slots=True)
class SubscriptionKey:
    environment: str
    feed_type: str
    symbol: str | None = None
    exchange: str | None = None
    ref_id: int | None = None


@dataclass(slots=True)
class SubscriptionState:
    key: SubscriptionKey
    consumers: set[str] = field(default_factory=set)


class PositioningSubscriptionManager:
    """
    Phase 1 registry only. It gives the positioning domain a stable boundary
    before we migrate feature-specific Nubra websocket sessions into shared
    feed connections.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._subscriptions: dict[SubscriptionKey, SubscriptionState] = {}

    def register(self, key: SubscriptionKey, consumer_id: str) -> None:
        with self._lock:
            state = self._subscriptions.setdefault(key, SubscriptionState(key=key))
            state.consumers.add(consumer_id)

    def unregister(self, key: SubscriptionKey, consumer_id: str) -> None:
        with self._lock:
            state = self._subscriptions.get(key)
            if not state:
                return
            state.consumers.discard(consumer_id)
            if not state.consumers:
                self._subscriptions.pop(key, None)

    def status(self) -> dict:
        with self._lock:
            return {
                "active_subscriptions": len(self._subscriptions),
                "subscriptions": [
                    {
                        "environment": state.key.environment,
                        "feed_type": state.key.feed_type,
                        "symbol": state.key.symbol,
                        "exchange": state.key.exchange,
                        "ref_id": state.key.ref_id,
                        "consumers": len(state.consumers),
                    }
                    for state in self._subscriptions.values()
                ],
            }


positioning_subscription_manager = PositioningSubscriptionManager()
