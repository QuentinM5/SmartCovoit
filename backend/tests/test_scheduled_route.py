"""Traffic calls use explicit instants and bounded arrival refinement."""
from datetime import date, datetime, time, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.distance.mapbox_directions import TrafficRoute
from app.distance.scheduled_route import scheduled_traffic
from app.solver.model import Direction


NOW = datetime(2026, 9, 1, tzinfo=timezone.utc)


def event(**changes):
    return SimpleNamespace(**(dict(event_date=date(2026, 9, 19), arrival_time=time(18),
                                   departure_time=time(23), departure_next_day=True,
                                   timezone="America/Toronto") | changes))


async def test_outbound_uses_local_next_day_and_single_request():
    provider = SimpleNamespace(route=AsyncMock(return_value=TrafficRoute(1800, [])))
    route, result = await scheduled_traffic(provider, [], event(), Direction.DISPERSION, None, now=NOW)
    depart = datetime(2026, 9, 21, 3, tzinfo=timezone.utc)
    provider.route.assert_awaited_once_with([], depart_at=depart)
    assert result["estimated_departure_at"] == depart
    assert result["estimated_arrival_at"] == depart + timedelta(minutes=30)
    assert result["estimation_basis"] == "traffic"


async def test_outbound_uses_selected_finish_date_across_dst_boundary():
    provider = SimpleNamespace(route=AsyncMock(return_value=TrafficRoute(1800, [])))
    e = event(event_date=date(2026, 10, 31), end_date=date(2026, 11, 3),
              departure_time=time(9), departure_next_day=False)
    _, result = await scheduled_traffic(provider, [], e, Direction.DISPERSION, None, now=NOW)
    depart = datetime(2026, 11, 3, 14, tzinfo=timezone.utc)
    provider.route.assert_awaited_once_with([], depart_at=depart)
    assert result["estimated_departure_at"] == depart
    assert result["estimated_arrival_at"] == depart + timedelta(minutes=30)


async def test_inbound_stops_at_three_queries_with_consistent_last_pair():
    provider = SimpleNamespace(route=AsyncMock(side_effect=[TrafficRoute(s, []) for s in (3600, 5400, 7200)]))
    route, result = await scheduled_traffic(provider, [], event(), Direction.RAMASSAGE, 1800, now=NOW)
    target = datetime(2026, 9, 19, 22, tzinfo=timezone.utc)
    assert [c.kwargs["depart_at"] for c in provider.route.await_args_list] == [
        target - timedelta(seconds=s) for s in (1800, 3600, 5400)]
    assert route.duration_s == 7200
    assert result["estimated_arrival_at"] - result["estimated_departure_at"] == timedelta(seconds=7200)
    assert result["estimated_departure_at"] == provider.route.await_args_list[-1].kwargs["depart_at"]


async def test_inbound_finishes_when_within_one_minute():
    provider = SimpleNamespace(route=AsyncMock(return_value=TrafficRoute(1859, [])))
    await scheduled_traffic(provider, [], event(), Direction.RAMASSAGE, 1800, now=NOW)
    provider.route.assert_awaited_once()


@pytest.mark.parametrize("direction,duration,now", [
    (Direction.RAMASSAGE, None, NOW),
    (Direction.RAMASSAGE, 3600, datetime(2026, 9, 19, 21, 30, tzinfo=timezone.utc)),
    (Direction.RAMASSAGE, 3600, datetime(2027, 1, 1, tzinfo=timezone.utc)),
    (Direction.DISPERSION, 3600, datetime(2027, 1, 1, tzinfo=timezone.utc)),
])
async def test_missing_inbound_duration_or_past_departure_skips_traffic(direction, duration, now):
    provider = SimpleNamespace(route=AsyncMock())
    assert await scheduled_traffic(provider, [], event(), direction, duration, now=now) == (None, {})
    provider.route.assert_not_awaited()


async def test_unscheduled_event_keeps_existing_current_traffic_behavior():
    provider = SimpleNamespace(route=AsyncMock(return_value=TrafficRoute(100, [])))
    _, result = await scheduled_traffic(provider, [], event(arrival_time=None), Direction.RAMASSAGE, None, now=NOW)
    provider.route.assert_awaited_once_with([])
    assert result == {}
