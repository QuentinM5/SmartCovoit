"""Tests des garde-fous de charge/coût (plafond d'inscrits, cooldown /solve,
élagage de l'historique des solutions) — fonctions pures, isolées de la base
de données, même philosophie que test_security.py.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from app.api.routes import _participant_cap_reached, _records_to_prune, _seconds_until_next_solve
from app.db.models import SolutionRecord

NOW = datetime(2026, 9, 3, 12, 0, 0, tzinfo=timezone.utc)


def test_participant_cap_not_reached_below_limit() -> None:
    assert not _participant_cap_reached(39, cap=40)


def test_participant_cap_reached_at_limit() -> None:
    # >= et non > : la 41e tentative sur un cap à 40 doit échouer, pas la
    # réussir puis échouer à la suivante.
    assert _participant_cap_reached(40, cap=40)


def test_participant_cap_reached_above_limit() -> None:
    assert _participant_cap_reached(41, cap=40)


def test_seconds_until_next_solve_no_previous_solve() -> None:
    assert _seconds_until_next_solve(None, NOW, cooldown_s=20) == 0.0


def test_seconds_until_next_solve_within_cooldown() -> None:
    last = NOW - timedelta(seconds=5)
    assert _seconds_until_next_solve(last, NOW, cooldown_s=20) == 15.0


def test_seconds_until_next_solve_cooldown_elapsed() -> None:
    last = NOW - timedelta(seconds=30)
    assert _seconds_until_next_solve(last, NOW, cooldown_s=20) == 0.0


def _record(created_at: datetime) -> SolutionRecord:
    return SolutionRecord(
        id=uuid.uuid4(),
        event_id=uuid.uuid4(),
        direction="ramassage",
        total_distance_m=0,
        matrix_source="haversine",
        payload=[],
        created_at=created_at,
    )


def test_records_to_prune_keeps_most_recent() -> None:
    oldest = _record(NOW - timedelta(minutes=3))
    middle = _record(NOW - timedelta(minutes=2))
    newest = _record(NOW - timedelta(minutes=1))
    pruned = _records_to_prune([middle, oldest, newest], keep=2)
    assert pruned == [oldest]


def test_records_to_prune_nothing_below_limit() -> None:
    records = [_record(NOW), _record(NOW - timedelta(minutes=1))]
    assert _records_to_prune(records, keep=20) == []
