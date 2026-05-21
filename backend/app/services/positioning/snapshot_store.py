from __future__ import annotations

import json
from typing import Any

from app.db import connect_db
from app.services.positioning.contracts import AlertItem, OptionsPressureSnapshot, PositioningSnapshot, utc_now_iso


class PositioningSnapshotStore:
    def save_snapshot(self, snapshot: PositioningSnapshot) -> None:
        payload = snapshot.model_dump()
        with connect_db() as connection:
            connection.execute(
                """
                insert into positioning_snapshots (universe, created_at, seq, status, payload_json)
                values (?, ?, ?, ?, ?)
                """,
                (snapshot.universe, snapshot.generated_at, snapshot.seq, snapshot.status, json.dumps(payload)),
            )
            connection.execute(
                """
                insert into positioning_latest_snapshots (universe, updated_at, seq, status, payload_json)
                values (?, ?, ?, ?, ?)
                on conflict(universe) do update set
                    updated_at = excluded.updated_at,
                    seq = excluded.seq,
                    status = excluded.status,
                    payload_json = excluded.payload_json
                """,
                (snapshot.universe, snapshot.generated_at, snapshot.seq, snapshot.status, json.dumps(payload)),
            )
            connection.commit()

    def load_latest_snapshot(self, universe: str = "volume-dashboard-all-nse") -> PositioningSnapshot | None:
        with connect_db() as connection:
            row = connection.execute(
                """
                select payload_json
                from positioning_latest_snapshots
                where universe = ?
                limit 1
                """,
                (universe,),
            ).fetchone()
        if not row:
            return None
        try:
            payload = json.loads(row["payload_json"])
            return PositioningSnapshot.model_validate(payload)
        except Exception:
            return None

    def save_alerts(self, alerts: list[AlertItem]) -> None:
        if not alerts:
            return
        with connect_db() as connection:
            connection.executemany(
                """
                insert or ignore into positioning_alert_history (
                    id, created_at, severity, source, title, message, payload_json
                )
                values (?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        alert.id,
                        alert.created_at,
                        alert.severity,
                        alert.source,
                        alert.title,
                        alert.message,
                        json.dumps(alert.payload),
                    )
                    for alert in alerts
                ],
            )
            connection.commit()

    def save_options_pressure(self, snapshot: OptionsPressureSnapshot, *, seq: int) -> None:
        with connect_db() as connection:
            connection.execute(
                """
                insert or replace into positioning_option_pressure_snapshots (
                    id, created_at, seq, underlying, call_pressure, put_pressure, payload_json
                )
                values (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    f"{snapshot.underlying}:{seq}",
                    utc_now_iso(),
                    seq,
                    snapshot.underlying,
                    snapshot.call_pressure,
                    snapshot.put_pressure,
                    json.dumps(snapshot.model_dump()),
                ),
            )
            connection.commit()

    def status(self) -> dict[str, Any]:
        latest = self.load_latest_snapshot()
        return {
            "has_snapshot": latest is not None,
            "latest_seq": latest.seq if latest else 0,
            "latest_status": latest.status if latest else "bootstrapping",
            "latest_generated_at": latest.generated_at if latest else None,
        }


positioning_snapshot_store = PositioningSnapshotStore()
