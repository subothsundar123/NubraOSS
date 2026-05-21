from __future__ import annotations

from dataclasses import asdict, dataclass

import pandas as pd


@dataclass(frozen=True, slots=True)
class OpeningRangeState:
    minutes: int
    high: float | None
    low: float | None
    state: str
    confidence: float


class OpeningRangeEngine:
    def compute(self, frame: pd.DataFrame, *, minutes: int) -> OpeningRangeState:
        if frame.empty:
            return OpeningRangeState(minutes=minutes, high=None, low=None, state="unavailable", confidence=0)
        sorted_frame = frame.sort_index()
        first_ts = sorted_frame.index[0]
        cutoff = first_ts + pd.Timedelta(minutes=minutes)
        opening = sorted_frame[sorted_frame.index < cutoff]
        if opening.empty:
            return OpeningRangeState(minutes=minutes, high=None, low=None, state="forming", confidence=20)
        high = float(opening["high"].max())
        low = float(opening["low"].min())
        latest = sorted_frame.iloc[-1]
        close = float(latest["close"])
        prior = sorted_frame.iloc[-2] if len(sorted_frame) > 1 else latest
        prior_close = float(prior["close"])
        if close > high:
            state = "breakout_hold" if prior_close > high else "breakout"
        elif close < low:
            state = "failure_hold" if prior_close < low else "failure"
        elif prior_close < low and close >= low:
            state = "reclaim"
        elif prior_close > high and close <= high:
            state = "rejection"
        else:
            state = "inside_range"
        width = max(high - low, 0.01)
        distance = max(abs(close - high), abs(close - low)) / width
        confidence = min(92, 38 + distance * 18 + min(len(sorted_frame), 30))
        return OpeningRangeState(
            minutes=minutes,
            high=round(high, 2),
            low=round(low, 2),
            state=state,
            confidence=round(confidence, 1),
        )

    def compute_all(self, frame: pd.DataFrame) -> dict[str, dict]:
        return {
            f"{minutes}m": asdict(self.compute(frame, minutes=minutes))
            for minutes in (5, 15, 30)
        }
