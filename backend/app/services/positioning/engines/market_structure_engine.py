from __future__ import annotations

from dataclasses import dataclass

import pandas as pd


@dataclass(frozen=True, slots=True)
class MarketStructureState:
    direction: str
    phase: str
    confidence: float
    events: list[dict]


class MarketStructureEngine:
    def compute(self, frame: pd.DataFrame, *, lookback: int = 8) -> MarketStructureState:
        if len(frame) < 4:
            return MarketStructureState(direction="neutral", phase="insufficient", confidence=10, events=[])
        working = frame.tail(max(lookback + 2, 6)).copy()
        latest = working.iloc[-1]
        previous = working.iloc[-2]
        prior_window = working.iloc[:-1]
        recent_high = float(prior_window["high"].max())
        recent_low = float(prior_window["low"].min())
        events: list[dict] = []
        if float(latest["close"]) > recent_high:
            events.append({"type": "structure_break_up", "price": round(float(latest["close"]), 2)})
        if float(latest["close"]) < recent_low:
            events.append({"type": "structure_break_down", "price": round(float(latest["close"]), 2)})

        highs = working["high"].tail(4).tolist()
        lows = working["low"].tail(4).tolist()
        higher_highs = highs[-1] > highs[-2] > highs[-3]
        higher_lows = lows[-1] > lows[-2] > lows[-3]
        lower_highs = highs[-1] < highs[-2] < highs[-3]
        lower_lows = lows[-1] < lows[-2] < lows[-3]
        range_width = float(working["high"].max() - working["low"].min())
        avg_close = max(abs(float(working["close"].mean())), 0.01)
        compression = (range_width / avg_close) * 100 < 0.45
        body = abs(float(latest["close"] - latest["open"]))
        prior_body = abs(float(previous["close"] - previous["open"]))

        if higher_highs and higher_lows:
            direction = "bullish"
            phase = "momentum_continuation" if body >= prior_body else "grinding_higher"
        elif lower_highs and lower_lows:
            direction = "bearish"
            phase = "momentum_continuation" if body >= prior_body else "grinding_lower"
        elif events:
            direction = "bullish" if events[-1]["type"] == "structure_break_up" else "bearish"
            phase = "structure_break"
        elif compression:
            direction = "neutral"
            phase = "compression"
        else:
            direction = "neutral"
            phase = "range_rotation"

        confidence = 42
        if direction != "neutral":
            confidence += 22
        if events:
            confidence += 12
        if compression:
            confidence -= 8
        return MarketStructureState(
            direction=direction,
            phase=phase,
            confidence=round(max(20, min(92, confidence)), 1),
            events=events[-4:],
        )
