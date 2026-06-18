"""
Strategy Engine — evaluates saved OIE strategies against live metrics.

Each strategy has condition groups (AND logic within group, OR across groups).
Returns a StrategyMatch with per-condition results and an overall match score.
"""
from __future__ import annotations

import json
import operator as op
from dataclasses import dataclass, field
from typing import Any


OPERATORS = {
    ">":  op.gt,
    "<":  op.lt,
    ">=": op.ge,
    "<=": op.le,
    "=":  lambda a, b: abs(a - b) < 0.001,
    "crosses above": op.gt,   # treated as > for snapshot evaluation
    "crosses below": op.lt,
}


@dataclass
class ConditionResult:
    metric: str
    operator: str
    threshold: float
    current_value: float | None
    passed: bool
    note: str = ""


@dataclass
class StrategyMatch:
    strategy_id: str
    strategy_name: str
    underlying: str
    action: str
    matched: bool
    match_score: float        # 0–100 pct of conditions passing
    matched_count: int
    total_count: int
    condition_results: list[ConditionResult] = field(default_factory=list)
    matched_groups: int = 0
    total_groups: int = 0


def evaluate_condition(
    condition: dict[str, Any],
    metrics: dict[str, Any],
    chain: Any,
) -> ConditionResult:
    metric_key = condition.get("metric", "")
    op_str = condition.get("operator", ">")
    try:
        threshold = float(condition.get("value", 0))
    except (TypeError, ValueError):
        threshold = 0.0

    # Resolve metric value — check metrics dict first, then chain attributes
    current_value: float | None = None
    m = metrics.get(metric_key)
    if m:
        v = m.get("value") if isinstance(m, dict) else getattr(m, "value", None)
        if v is not None:
            try:
                current_value = float(v)
            except (TypeError, ValueError):
                pass

    if current_value is None and chain is not None:
        # Fallback: check chain-level fields (spot_price, pcr, max_pain, etc.)
        chain_val = getattr(chain, metric_key, None)
        if chain_val is not None:
            try:
                current_value = float(chain_val)
            except (TypeError, ValueError):
                pass

    if current_value is None:
        return ConditionResult(metric_key, op_str, threshold, None, False, "metric unavailable")

    fn = OPERATORS.get(op_str, op.gt)
    try:
        passed = fn(current_value, threshold)
    except Exception:
        passed = False

    note = f"{current_value:.4g} {op_str} {threshold:.4g} → {'✓' if passed else '✗'}"
    return ConditionResult(metric_key, op_str, threshold, current_value, passed, note)


def evaluate_strategy(
    strategy: dict[str, Any],
    metrics: dict[str, Any],
    chain: Any,
) -> StrategyMatch:
    """Evaluate one strategy row against current metrics/chain."""
    sid = strategy.get("id", "")
    name = strategy.get("name", "Strategy")
    underlying = strategy.get("underlying", "")
    action = strategy.get("action", "alert")

    # Parse condition groups
    raw_groups = strategy.get("entry_conditions_json") or strategy.get("entry_conditions") or []
    if isinstance(raw_groups, str):
        try:
            raw_groups = json.loads(raw_groups)
        except Exception:
            raw_groups = []

    all_results: list[ConditionResult] = []
    group_passed = 0
    total_groups = len(raw_groups)

    for group in raw_groups:
        conditions = group.get("conditions", []) if isinstance(group, dict) else []
        logic = group.get("logic", "AND") if isinstance(group, dict) else "AND"

        group_results: list[ConditionResult] = []
        for cond in conditions:
            r = evaluate_condition(cond, metrics, chain)
            group_results.append(r)
            all_results.append(r)

        if not group_results:
            continue

        # AND: all must pass; OR: at least one must pass
        if logic == "AND":
            group_ok = all(r.passed for r in group_results)
        else:
            group_ok = any(r.passed for r in group_results)

        if group_ok:
            group_passed += 1

    total = len(all_results)
    matched_count = sum(1 for r in all_results if r.passed)
    match_score = round(matched_count / total * 100, 1) if total > 0 else 0.0

    # Strategy fires if ALL groups pass (groups are OR-linked internally, AND-linked externally)
    matched = group_passed == total_groups and total_groups > 0

    return StrategyMatch(
        strategy_id=sid,
        strategy_name=name,
        underlying=underlying,
        action=action,
        matched=matched,
        match_score=match_score,
        matched_count=matched_count,
        total_count=total,
        condition_results=all_results,
        matched_groups=group_passed,
        total_groups=total_groups,
    )


def evaluate_all_strategies(
    metrics: dict[str, Any],
    chain: Any,
    environment: str,
) -> list[StrategyMatch]:
    """Load all active strategies from DB and evaluate each."""
    try:
        from app.db import get_db_connection
        with get_db_connection() as conn:
            rows = conn.execute(
                "select id, name, underlying, action, entry_conditions_json "
                "from oie_strategies where is_active=1 order by created_at desc"
            ).fetchall()
    except Exception:
        return []

    results = []
    for row in rows:
        s = dict(zip(["id", "name", "underlying", "action", "entry_conditions_json"], row))
        # Only evaluate strategies matching this underlying
        chain_und = getattr(chain, "underlying", "").upper()
        if s.get("underlying", "").upper() not in (chain_und, ""):
            continue
        match = evaluate_strategy(s, metrics, chain)
        results.append(match)

    return results
