from __future__ import annotations

from dataclasses import dataclass

import pandas as pd


@dataclass(frozen=True, slots=True)
class VwapState:
    latest_vwap: float | None
    distance_pct: float | None
    relation: str
    confidence: float


class VwapEngine:
    def apply_session_vwap(self, frame: pd.DataFrame) -> pd.DataFrame:
        if frame.empty:
            return frame.copy()
        working = frame.copy()
        typical = (working["high"] + working["low"] + working["close"]) / 3
        volume = working["bucket_volume"].fillna(0).clip(lower=0)
        cumulative_volume = volume.cumsum()
        cumulative_pv = (typical * volume).cumsum()
        working["session_vwap"] = cumulative_pv.divide(cumulative_volume.where(cumulative_volume > 0))
        return working

    def state(self, frame: pd.DataFrame) -> VwapState:
        if frame.empty or "session_vwap" not in frame.columns:
            return VwapState(latest_vwap=None, distance_pct=None, relation="unavailable", confidence=0)
        latest = frame.iloc[-1]
        vwap = latest.get("session_vwap")
        close = latest.get("close")
        if pd.isna(vwap) or pd.isna(close) or float(vwap) <= 0:
            return VwapState(latest_vwap=None, distance_pct=None, relation="unavailable", confidence=0)
        distance_pct = ((float(close) - float(vwap)) / float(vwap)) * 100
        if distance_pct > 0.18:
            relation = "accepted_above"
        elif distance_pct < -0.18:
            relation = "accepted_below"
        elif distance_pct >= 0:
            relation = "testing_above"
        else:
            relation = "testing_below"
        confidence = min(90, max(30, abs(distance_pct) * 18 + 45))
        return VwapState(
            latest_vwap=round(float(vwap), 2),
            distance_pct=round(distance_pct, 2),
            relation=relation,
            confidence=round(confidence, 1),
        )
