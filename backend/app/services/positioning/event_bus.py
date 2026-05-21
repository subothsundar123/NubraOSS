from __future__ import annotations

import queue
import threading

from app.services.positioning.contracts import PositioningEvent


class PositioningEventBus:
    def __init__(self) -> None:
        self._subscribers: set[queue.SimpleQueue[PositioningEvent]] = set()
        self._lock = threading.Lock()
        self._last_event: PositioningEvent | None = None

    def subscribe(self) -> queue.SimpleQueue[PositioningEvent]:
        q: queue.SimpleQueue[PositioningEvent] = queue.SimpleQueue()
        with self._lock:
            self._subscribers.add(q)
        return q

    def unsubscribe(self, q: queue.SimpleQueue[PositioningEvent]) -> None:
        with self._lock:
            self._subscribers.discard(q)

    def publish(self, event: PositioningEvent) -> None:
        with self._lock:
            subscribers = list(self._subscribers)
            self._last_event = event
        for subscriber in subscribers:
            subscriber.put(event)

    @property
    def subscriber_count(self) -> int:
        with self._lock:
            return len(self._subscribers)

    @property
    def last_event(self) -> PositioningEvent | None:
        return self._last_event


positioning_event_bus = PositioningEventBus()
