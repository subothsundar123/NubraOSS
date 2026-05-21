from __future__ import annotations

import logging
import threading
import time
from typing import Any

from app.services.positioning.contracts import PositioningEvent, PositioningSnapshot, empty_snapshot, utc_now_iso
from app.services.positioning.engines import (
    AlertEngine,
    BreadthEngine,
    CommentaryEngine,
    MarketInternalsEngine,
    OpportunityEngine,
    OptionsPressureEngine,
    RegimeEngine,
    SectorRotationEngine,
    SentimentEngine,
    SmartMoneyEngine,
)
from app.services.positioning.event_bus import positioning_event_bus
from app.services.positioning.market_data_bus import positioning_market_data_bus
from app.services.positioning.snapshot_store import positioning_snapshot_store
from app.services.positioning.subscription_manager import positioning_subscription_manager
from app.services.volume_breakout_service import volume_breakout_service

logger = logging.getLogger(__name__)


class PositioningOrchestrator:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._running = False
        self._thread: threading.Thread | None = None
        self._seq = 0
        self._snapshot: PositioningSnapshot = empty_snapshot()
        self._last_error: str | None = None
        self._snapshot_restored = False  # True once we've loaded from the DB on startup
        self._breadth = BreadthEngine()
        self._sector = SectorRotationEngine()
        self._smart_money = SmartMoneyEngine()
        self._internals = MarketInternalsEngine()
        self._options = OptionsPressureEngine()
        self._sentiment = SentimentEngine()
        self._regime = RegimeEngine()
        self._opportunities = OpportunityEngine()
        self._commentary = CommentaryEngine()
        self._alerts = AlertEngine()

    # ──────────────────────────────────────────────────────────────
    # Lifecycle
    # ──────────────────────────────────────────────────────────────

    def start(self) -> None:
        with self._lock:
            if self._running:
                return
            self._running = True
            volume_breakout_service.retain_consumer("positioning-orchestrator")
            # Restore the last persisted positioning snapshot immediately so the
            # UI receives real data on reconnect rather than an empty bootstrapping
            # screen while the scanner re-hydrates.
            try:
                persisted = positioning_snapshot_store.load_latest_snapshot()
                if persisted is not None:
                    self._snapshot = persisted
                    self._seq = persisted.seq
                    self._snapshot_restored = True
                    logger.info(
                        "positioning.orchestrator.snapshot_restored seq=%s status=%s",
                        persisted.seq,
                        persisted.status,
                    )
            except Exception as exc:
                logger.warning("positioning.orchestrator.snapshot_restore_failed error=%s", exc)
            self._thread = threading.Thread(target=self._run_loop, name="positioning-orchestrator", daemon=True)
            self._thread.start()

    def stop(self) -> None:
        with self._lock:
            self._running = False
            thread = self._thread
        if thread:
            thread.join(timeout=2.0)
        volume_breakout_service.release_consumer("positioning-orchestrator")

    def bootstrap_scanner(self, init: dict[str, Any]) -> dict[str, Any]:
        session_token = str(init.get("session_token") or init.get("sessionToken") or "").strip()
        device_id = str(init.get("device_id") or init.get("deviceId") or "positioning-system").strip()
        environment = str(init.get("environment") or "PROD").strip().upper()
        if not session_token or len(session_token) < 10:
            return {
                "started": False,
                "reason": "positioning init did not include a usable session token",
                "scanner_status": volume_breakout_service.status().model_dump(),
            }
        request = volume_breakout_service.default_positioning_request(
            session_token=session_token,
            device_id=device_id,
            environment=environment,
        )
        status = volume_breakout_service.ensure_system_runtime(request, consumer_id="positioning-orchestrator")
        return {
            "started": status.running,
            "reason": status.idle_reason,
            "scanner_status": status.model_dump(),
        }

    def snapshot(self) -> PositioningSnapshot:
        with self._lock:
            return self._snapshot

    def status(self) -> dict[str, Any]:
        with self._lock:
            snapshot = self._snapshot
            running = self._running
            thread_alive = bool(self._thread and self._thread.is_alive())
            last_error = self._last_error
            snapshot_restored = self._snapshot_restored
        scanner_status = volume_breakout_service.status().model_dump()
        return {
            "running": running,
            "thread_alive": thread_alive,
            "seq": snapshot.seq,
            "status": snapshot.status,
            "generated_at": snapshot.generated_at,
            "last_error": last_error,
            "snapshot_restored_from_db": snapshot_restored,
            "hydration_readiness": self._hydration_readiness(snapshot, scanner_status),
            "scanner": scanner_status,
            "event_subscribers": positioning_event_bus.subscriber_count,
            "snapshot_store": positioning_snapshot_store.status(),
            "market_data_bus": positioning_market_data_bus.status(),
            "subscription_manager": positioning_subscription_manager.status(),
        }

    # ──────────────────────────────────────────────────────────────
    # Core build cycle
    # ──────────────────────────────────────────────────────────────

    def build_once(self) -> PositioningSnapshot:
        self._seq += 1
        volume_status = volume_breakout_service.status()
        payload = volume_status.model_dump()
        positioning_market_data_bus.publish_latest("volume_breakout_status", payload)

        # Full unbiased universe rows for breadth/internals/participation engines.
        # Falls back to sector_heatmap_rows (for cached/restored snapshots where
        # all_scanned_rows is empty) and then to filtered breakout lists.
        market_rows = self._collect_rows(payload)

        # Active breakout rows preserved separately — used by engines that need
        # "what's actually breaking out right now" rather than the full universe.
        active_rows = self._collect_active_rows(payload)

        # Structure context derived from per-symbol VWAP and structure phase fields
        # that the scanner now computes in every _scan_symbol call.
        structure_context = self._compute_structure_context(market_rows)

        context: dict[str, Any] = {
            "seq": self._seq,
            "volume_status": payload,
            "market_rows": market_rows,
            "active_rows": active_rows,
            "structure_context": structure_context,
        }
        breadth = self._breadth.compute(context)
        context["breadth"] = breadth
        sector = self._sector.compute(context)
        context["sector_rotation"] = sector
        smart_money = self._smart_money.compute(context)
        context["smart_money"] = smart_money
        internals = self._internals.compute(context)
        context["market_internals"] = internals
        options = self._options.compute(context)
        context["options_pressure"] = options
        sentiment = self._sentiment.compute(context)
        context["sentiment"] = sentiment
        regime = self._regime.compute(context)
        context["regime"] = regime
        opportunities = self._opportunities.compute(context)
        context["opportunities"] = opportunities
        commentary = self._commentary.compute(context)
        alerts = self._alerts.compute(context)

        snapshot = PositioningSnapshot(
            seq=self._seq,
            status=self._determine_status(market_rows, payload),
            universe=str(payload.get("universe_slug") or "volume-dashboard-all-nse"),
            generated_at=utc_now_iso(),
            market_status=str((payload.get("summary") or {}).get("market_status") or "unknown"),
            breadth=breadth,
            sector_rotation=sector,
            sentiment=sentiment,
            regime=regime,
            smart_money=smart_money,
            options_pressure=options,
            market_internals=internals,
            opportunities=opportunities,
            commentary=commentary,
            alerts=alerts,
            feed_health=self._build_feed_health(payload, market_rows, active_rows, structure_context),
        )
        with self._lock:
            self._snapshot = snapshot
            self._snapshot_restored = False  # first live build clears the restored flag
        positioning_snapshot_store.save_snapshot(snapshot)
        positioning_snapshot_store.save_alerts(alerts)
        positioning_snapshot_store.save_options_pressure(options, seq=snapshot.seq)
        positioning_event_bus.publish(
            PositioningEvent(
                type="snapshot",
                seq=snapshot.seq,
                payload=snapshot.model_dump(),
            )
        )
        return snapshot

    def _run_loop(self) -> None:
        while True:
            with self._lock:
                if not self._running:
                    return
            try:
                self.build_once()
                self._last_error = None
            except Exception as exc:
                self._last_error = str(exc)
                logger.exception("positioning.orchestrator.build_once_failed error=%s", exc)
                positioning_event_bus.publish(
                    PositioningEvent(
                        type="error",
                        seq=self._seq,
                        payload={"message": str(exc), "source": "positioning_orchestrator"},
                    )
                )
            time.sleep(5.0)

    # ──────────────────────────────────────────────────────────────
    # Row collection
    # ──────────────────────────────────────────────────────────────

    def _collect_rows(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        """
        Return the full scanned universe for the current cycle.

        Priority:
          1. all_scanned_rows — populated live from partial_scan_rows (every symbol
             that completed the scan, including those with no sector). This is the
             unbiased universe that breadth/internals engines should use.
          2. sector_heatmap_rows — serialized in cached/restored snapshots, covers
             most of the universe (all symbols with a sector, up to 500 rows).
          3. Filtered breakout/mover lists — last resort when nothing else is
             available (yields biased breadth but is better than an empty state).
        """
        rows: list[dict[str, Any]] = []
        seen: set[tuple[str, str]] = set()

        def _add(source_rows: list) -> None:
            for row in source_rows:
                if not isinstance(row, dict):
                    continue
                identity = (str(row.get("symbol") or ""), str(row.get("exchange") or ""))
                if identity in seen:
                    continue
                seen.add(identity)
                rows.append(row)

        all_scanned = payload.get("all_scanned_rows") or []
        if all_scanned:
            _add(all_scanned)
            return rows

        # Fallback: sector_heatmap_rows is the widest serialized list (~500 stocks)
        _add(payload.get("sector_heatmap_rows") or [])

        # Add anything from filtered lists that sector_heatmap missed (no sector)
        for key in ("market_breakouts", "recent_breakouts", "confirmed_breakouts", "movers_up", "movers_down"):
            _add(payload.get(key) or [])

        return rows

    def _collect_active_rows(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        """Return only the current breakout rows — used where 'what is actively moving' matters."""
        rows: list[dict[str, Any]] = []
        seen: set[tuple[str, str]] = set()
        for key in ("market_breakouts", "recent_breakouts", "confirmed_breakouts"):
            for row in payload.get(key) or []:
                if not isinstance(row, dict):
                    continue
                identity = (str(row.get("symbol") or ""), str(row.get("exchange") or ""))
                if identity in seen:
                    continue
                seen.add(identity)
                rows.append(row)
        return rows

    # ──────────────────────────────────────────────────────────────
    # Structure context
    # ──────────────────────────────────────────────────────────────

    def _compute_structure_context(self, rows: list[dict[str, Any]]) -> dict[str, Any]:
        """
        Aggregate per-symbol VWAP and structure fields (populated by the scanner's
        _scan_symbol) into market-wide structure intelligence for the orchestrator's
        engine context.
        """
        if not rows:
            return {"available": False}

        rows_with_vwap = [r for r in rows if r.get("vwap_relation") is not None]
        if not rows_with_vwap:
            return {"available": False, "reason": "scanner has not yet computed VWAP fields"}

        above_vwap_count = sum(1 for r in rows_with_vwap if r.get("above_vwap"))
        pct_above_vwap = round(above_vwap_count / len(rows_with_vwap) * 100, 1)

        # Classify VWAP acceptance distribution
        vwap_accepted_above = sum(1 for r in rows_with_vwap if r.get("vwap_relation") == "accepted_above")
        vwap_testing_above = sum(1 for r in rows_with_vwap if r.get("vwap_relation") == "testing_above")
        vwap_testing_below = sum(1 for r in rows_with_vwap if r.get("vwap_relation") == "testing_below")
        vwap_accepted_below = sum(1 for r in rows_with_vwap if r.get("vwap_relation") == "accepted_below")

        # Structure phase distribution
        phase_counts: dict[str, int] = {}
        for r in rows:
            phase = r.get("structure_phase")
            if phase:
                phase_counts[phase] = phase_counts.get(phase, 0) + 1
        dominant_phase = max(phase_counts, key=lambda k: phase_counts[k]) if phase_counts else None

        # Compression score: fraction of stocks in compression or range_rotation phases
        compression_phases = {"compression", "range_rotation"}
        compression_count = sum(v for k, v in phase_counts.items() if k in compression_phases)
        expansion_phases = {"momentum_continuation", "structure_break", "grinding_higher", "grinding_lower"}
        expansion_count = sum(v for k, v in phase_counts.items() if k in expansion_phases)
        structure_sample = sum(phase_counts.values())
        compression_pct = round(compression_count / structure_sample * 100, 1) if structure_sample else 0
        expansion_pct = round(expansion_count / structure_sample * 100, 1) if structure_sample else 0

        return {
            "available": True,
            "vwap_sample_size": len(rows_with_vwap),
            "total_rows": len(rows),
            "pct_above_vwap": pct_above_vwap,
            "above_vwap_count": above_vwap_count,
            "vwap_distribution": {
                "accepted_above": vwap_accepted_above,
                "testing_above": vwap_testing_above,
                "testing_below": vwap_testing_below,
                "accepted_below": vwap_accepted_below,
            },
            "dominant_phase": dominant_phase,
            "phase_distribution": phase_counts,
            "compression_pct": compression_pct,
            "expansion_pct": expansion_pct,
            "market_posture": (
                "expanding" if expansion_pct >= 35
                else "compressing" if compression_pct >= 45
                else "mixed"
            ),
        }

    # ──────────────────────────────────────────────────────────────
    # Status and diagnostics helpers
    # ──────────────────────────────────────────────────────────────

    def _determine_status(
        self,
        rows: list[dict[str, Any]],
        payload: dict[str, Any],
    ) -> str:
        if not rows:
            return "bootstrapping"
        is_stale = bool(payload.get("restored_from_snapshot") or payload.get("is_cached_snapshot"))
        hydration = str(payload.get("hydration_state") or "cold")
        if is_stale or hydration in ("stale", "restoring_snapshot", "cold"):
            return "degraded"
        return "ready"

    def _build_feed_health(
        self,
        payload: dict[str, Any],
        market_rows: list[dict[str, Any]],
        active_rows: list[dict[str, Any]],
        structure_context: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            "source": "volume_breakout_service",
            # Row count diagnostics
            "full_universe_rows": len(market_rows),
            "active_breakout_rows": len(active_rows),
            "scanner_rows": len(market_rows),           # legacy key kept for frontend compat
            "universe_size": payload.get("universe_size", 0),
            # Structure intelligence availability
            "structure_context_available": structure_context.get("available", False),
            "pct_above_vwap": structure_context.get("pct_above_vwap"),
            "market_posture": structure_context.get("market_posture"),
            "dominant_structure_phase": structure_context.get("dominant_phase"),
            # Scanner lifecycle state
            "hydration_state": payload.get("hydration_state"),
            "is_cached_snapshot": bool(payload.get("is_cached_snapshot")),
            "restored_from_snapshot": bool(payload.get("restored_from_snapshot")),
            "idle_reason": payload.get("idle_reason"),
            "last_run_ist": payload.get("last_run_ist"),
            "last_error": payload.get("last_error"),
            # Consumer ownership visibility
            "active_consumers": payload.get("active_consumers"),
            "retained_consumers": payload.get("retained_consumers"),
            "event_subscribers": payload.get("event_subscribers"),
        }

    def _hydration_readiness(
        self,
        snapshot: PositioningSnapshot,
        scanner_status: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Structured diagnostic that answers: "WHY is the positioning terminal in this state?"
        Surfaced through /api/positioning/status so operators can diagnose empty UI.
        """
        full_rows = snapshot.feed_health.get("full_universe_rows", 0)
        active_rows = snapshot.feed_health.get("active_breakout_rows", 0)
        scanner_hydration = scanner_status.get("hydration_state", "cold")
        scanner_running = bool(scanner_status.get("running"))
        idle_reason = scanner_status.get("idle_reason")
        is_cached = bool(snapshot.feed_health.get("is_cached_snapshot"))
        is_restored = bool(snapshot.feed_health.get("restored_from_snapshot"))
        universe_size = scanner_status.get("universe_size", 0)

        if full_rows > 0 and not is_cached and not is_restored:
            readiness = "live"
        elif full_rows > 0 and (is_cached or is_restored):
            readiness = "serving_stale_cache"
        elif scanner_running and scanner_hydration in ("scanning", "syncing_history", "partially_ready"):
            readiness = "scanner_hydrating"
        elif scanner_running and scanner_hydration == "hydrating":
            readiness = "scanner_hydrating"
        elif scanner_running and scanner_hydration == "live":
            readiness = "scanner_live_no_rows_yet"
        elif scanner_hydration == "cold":
            readiness = "awaiting_credentials"
        elif scanner_hydration == "stale":
            readiness = "scanner_idle_stale"
        elif scanner_hydration == "degraded":
            readiness = "scanner_degraded"
        else:
            readiness = scanner_hydration

        return {
            "readiness": readiness,
            "full_universe_rows": full_rows,
            "active_breakout_rows": active_rows,
            "universe_size": universe_size,
            "scanner_running": scanner_running,
            "scanner_hydration_state": scanner_hydration,
            "idle_reason": idle_reason,
            "scanner_consumers": scanner_status.get("active_consumers", 0),
            "is_serving_stale_data": is_cached or is_restored,
            "needs_credentials": readiness == "awaiting_credentials",
        }


positioning_orchestrator = PositioningOrchestrator()
