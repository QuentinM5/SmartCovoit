"""Venue-local schedules, DST boundaries, and API update semantics."""
from datetime import date, datetime, time, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
import uuid

import pytest
from fastapi import HTTPException

from app.api import routes, schemas
from app.event_schedule import local_instant, schedule_target, timezone_for_location, typical_schedule, validate_schedule
from app.solver.model import Direction


def event(**changes):
    values = dict(id=uuid.uuid4(), owner_id=None, event_date=date(2026, 9, 19),
                  arrival_time=time(18), departure_time=time(22), departure_next_day=False,
                  timezone="America/Toronto", depot_address="Montreal", depot_lat=45.5019, depot_lon=-73.5674)
    return SimpleNamespace(**(values | changes))


@pytest.mark.parametrize("lat,lon,day,clock,expected", [
    (45.5019, -73.5674, date(2026, 9, 19), time(18), "2026-09-19T22:00:00+00:00"),
    (48.8566, 2.3522, date(2026, 9, 19), time(18), "2026-09-19T16:00:00+00:00"),
])
def test_coordinates_resolve_venue_local_time(lat, lon, day, clock, expected):
    assert local_instant(day, clock, timezone_for_location(lat, lon)).isoformat() == expected


@pytest.mark.parametrize("zone,day", [("America/Toronto", date(2026, 3, 8)), ("Europe/Paris", date(2026, 3, 29))])
def test_nonexistent_spring_time_rejected(zone, day):
    with pytest.raises(ValueError, match="n'existe pas"):
        local_instant(day, time(2, 30), zone)


@pytest.mark.parametrize("zone,day,clock,expected", [
    ("America/Toronto", date(2026, 11, 1), time(1, 30), "2026-11-01T05:30:00+00:00"),
    ("Europe/Paris", date(2026, 10, 25), time(2, 30), "2026-10-25T00:30:00+00:00"),
])
def test_repeated_autumn_time_uses_first_occurrence(zone, day, clock, expected):
    assert local_instant(day, clock, zone).isoformat() == expected


@pytest.mark.parametrize("clock", [time(18, 0, 1), time(18, tzinfo=timezone.utc), time(18, microsecond=1)])
def test_only_local_minutes_accepted(clock):
    with pytest.raises(ValueError, match="HH:MM"):
        local_instant(date(2026, 9, 19), clock, "Europe/Paris")


def test_next_day_departure_and_previous_day_pickup():
    e = event(arrival_time=time(0, 30), departure_time=time(0, 15), departure_next_day=True)
    validate_schedule(e)
    assert schedule_target(e, Direction.DISPERSION).isoformat() == "2026-09-20T04:15:00+00:00"
    result = typical_schedule(e, Direction.RAMASSAGE, 3600)
    assert result["estimated_departure_at"].isoformat() == "2026-09-19T03:30:00+00:00"
    assert result["estimation_basis"] == "typical"


def test_no_clocks_and_missing_duration_do_not_invent_schedule():
    e = event(arrival_time=None, departure_time=None, departure_next_day=True, timezone=None)
    validate_schedule(e)
    assert e.departure_next_day is False
    assert typical_schedule(e, Direction.RAMASSAGE, 1800) == {}
    assert typical_schedule(event(), Direction.RAMASSAGE, None) == {}


def test_departure_before_arrival_requires_next_day():
    with pytest.raises(ValueError, match="lendemain"):
        validate_schedule(event(departure_time=time(17)))


def test_patch_distinguishes_omitted_clock_from_explicit_null():
    assert schemas.EventUpdate(name="Updated").model_dump(exclude_unset=True) == {"name": "Updated"}
    assert schemas.EventUpdate(arrival_time=None).model_dump(exclude_unset=True) == {"arrival_time": None}


@pytest.mark.parametrize("payload,directions", [
    ({"arrival_time": None}, [Direction.RAMASSAGE]),
    ({"departure_time": None}, [Direction.DISPERSION]),
    ({"event_date": "2026-09-20"}, [Direction.RAMASSAGE, Direction.DISPERSION]),
    ({"arrival_time": "18:00"}, []),
    ({"name": "Updated"}, []),
    ({"depot_address": "Montreal", "lat": 45.5019, "lon": -73.5674}, []),
])
async def test_update_invalidates_only_affected_solutions(monkeypatch, payload, directions):
    e = event(departure_next_day=True)
    monkeypatch.setattr(routes, "_get_event_or_404", AsyncMock(return_value=e))
    monkeypatch.setattr(routes, "log_event", Mock())
    db = SimpleNamespace(execute=AsyncMock(), commit=AsyncMock(), refresh=AsyncMock())
    result = await routes.update_event(e.id, schemas.EventUpdate(**payload),
                                      current_user=SimpleNamespace(id=uuid.uuid4()), db=db,
                                      geocoder=Mock(), settings=SimpleNamespace(instance_name="test"))
    assert result is e
    if directions:
        params = db.execute.call_args.args[0].compile().params
        assert directions in params.values()
    else:
        db.execute.assert_not_awaited()
    if "departure_time" in payload:
        assert e.departure_time is None
        assert e.departure_next_day is False
    if "arrival_time" not in payload:
        assert e.arrival_time == time(18)
    db.commit.assert_awaited_once()


async def test_create_resolves_timezone_and_preserves_optional_hours(monkeypatch):
    monkeypatch.setattr(routes, "log_event", Mock())
    db = SimpleNamespace(add=Mock(), commit=AsyncMock(), refresh=AsyncMock())
    result = await routes.create_event(
        schemas.EventCreate(name="Evening", depot_address="Paris", lat=48.8566, lon=2.3522,
                            event_date="2026-09-19", arrival_time="18:00", departure_time="01:00",
                            departure_next_day=True),
        current_user=SimpleNamespace(id=uuid.uuid4()), db=db, geocoder=Mock(),
        settings=SimpleNamespace(instance_name="test"))
    assert result.timezone == "Europe/Paris"
    assert result.arrival_time == time(18)
    assert result.departure_next_day is True
    db.commit.assert_awaited_once()


async def test_invalid_creation_is_not_committed(monkeypatch):
    db = SimpleNamespace(add=Mock(), commit=AsyncMock(), refresh=AsyncMock())
    with pytest.raises(HTTPException) as exc:
        await routes.create_event(
            schemas.EventCreate(name="Gap", depot_address="Paris", lat=48.8566, lon=2.3522,
                                event_date="2026-03-29", arrival_time="02:30"),
            current_user=SimpleNamespace(id=uuid.uuid4()), db=db, geocoder=Mock(),
            settings=SimpleNamespace(instance_name="test"))
    assert exc.value.status_code == 422
    db.commit.assert_not_awaited()


async def test_venue_change_recomputes_timezone_retains_wall_clocks_and_invalidates_both(monkeypatch):
    e = event()
    monkeypatch.setattr(routes, "_get_event_or_404", AsyncMock(return_value=e))
    monkeypatch.setattr(routes, "log_event", Mock())
    db = SimpleNamespace(execute=AsyncMock(), commit=AsyncMock(), refresh=AsyncMock())
    await routes.update_event(e.id, schemas.EventUpdate(depot_address="Paris", lat=48.8566, lon=2.3522),
                              current_user=SimpleNamespace(id=uuid.uuid4()), db=db, geocoder=Mock(),
                              settings=SimpleNamespace(instance_name="test"))
    assert e.timezone == "Europe/Paris"
    assert e.arrival_time == time(18)
    assert e.departure_time == time(22)
    statement = db.execute.call_args.args[0]
    assert "direction" not in str(statement)
    assert e.id in statement.compile().params.values()


@pytest.mark.parametrize("payload", [{"event_date": None}, {"departure_time": "17:00"}])
async def test_invalid_update_never_commits_or_removes_solutions(monkeypatch, payload):
    e = event()
    monkeypatch.setattr(routes, "_get_event_or_404", AsyncMock(return_value=e))
    db = SimpleNamespace(execute=AsyncMock(), commit=AsyncMock(), refresh=AsyncMock())
    with pytest.raises(HTTPException) as exc:
        await routes.update_event(e.id, schemas.EventUpdate(**payload),
                                  current_user=SimpleNamespace(id=uuid.uuid4()), db=db, geocoder=Mock(),
                                  settings=SimpleNamespace(instance_name="test"))
    assert exc.value.status_code == 422
    db.execute.assert_not_awaited()
    db.commit.assert_not_awaited()


async def test_solve_mapbox_failure_persists_typical_estimates(monkeypatch):
    import anyio
    from app.distance.mapbox_directions import MapboxDirectionsError

    driver_id = uuid.uuid4()
    e = event(event_date=date(2099, 9, 19), drivers=[SimpleNamespace(
        id=driver_id, name="Driver", direction=Direction.RAMASSAGE,
        seats=4, lat=45.6, lon=-73.6)], passengers=[])
    monkeypatch.setattr(routes, "_load_event_with_participants", AsyncMock(return_value=e))
    monkeypatch.setattr(routes, "_check_can_view_event", AsyncMock())
    monkeypatch.setattr(routes, "log_event", Mock())
    monkeypatch.setattr(routes, "log_event_now", AsyncMock())
    stops = [SimpleNamespace(node=n, passenger_id=None, cumulative_distance_m=d,
                             cumulative_duration_s=s) for n, d, s in [(1, 0, 0), (0, 10000, 1800)]]
    solved_route = SimpleNamespace(driver_id=str(driver_id), driver_name="Driver", distance_m=10000,
                                   duration_s=1800, stops=stops)
    monkeypatch.setattr(routes, "solve", Mock(return_value=SimpleNamespace(
        routes=[solved_route], total_distance_m=10000, total_duration_s=1800)))

    async def refresh(record):
        record.id = uuid.uuid4()
        record.created_at = datetime.now(timezone.utc)

    db = SimpleNamespace(scalar=AsyncMock(return_value=None), add=Mock(), commit=AsyncMock(),
                         refresh=AsyncMock(side_effect=refresh))
    matrix = SimpleNamespace(matrix=AsyncMock(return_value=SimpleNamespace(
        distances=[[0, 10000], [10000, 0]], durations=[[0, 1800], [1800, 0]],
        source="osrm", fallback_reason=None)), route_geometry=AsyncMock(return_value=[[45.6, -73.6], [45.5, -73.5]]))
    traffic = SimpleNamespace(route=AsyncMock(side_effect=MapboxDirectionsError("unavailable")))
    output = await routes.solve_event(e.id, Direction.RAMASSAGE,
        current_user=SimpleNamespace(id=uuid.uuid4()), db=db, matrix_provider=matrix,
        directions_provider=traffic, settings=SimpleNamespace(instance_name="test", solve_cooldown_s=0,
        max_solves_per_user_per_day=100, solver_time_limit_s=1), solve_semaphore=anyio.Semaphore(1))
    result = output.routes[0]
    assert result.estimation_basis == "typical"
    assert result.traffic_duration_s is None
    assert result.estimated_arrival_at == schedule_target(e, Direction.RAMASSAGE)
    assert (result.estimated_arrival_at - result.estimated_departure_at).total_seconds() == 1800
    persisted = db.add.call_args.args[0].payload[0]
    assert persisted["estimation_basis"] == "typical"
    assert persisted["traffic_duration_s"] is None
    assert persisted["estimated_departure_at"] is not None
    matrix.route_geometry.assert_awaited_once()
    traffic.route.assert_awaited_once()
