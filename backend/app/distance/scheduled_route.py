"""Bounded traffic refinement after the solver has selected the groups."""
from datetime import datetime, timedelta, timezone

from app.distance.mapbox_directions import MapboxDirectionsProvider, TrafficRoute
from app.event_schedule import schedule_target
from app.solver.model import Direction


async def scheduled_traffic(provider: MapboxDirectionsProvider, coords, event, direction, duration,
                            *, now: datetime | None = None) -> tuple[TrafficRoute | None, dict]:
    now = now or datetime.now(timezone.utc)
    target = schedule_target(event, direction)
    if target is None:
        return await provider.route(coords), {}
    if target <= now or (direction == Direction.RAMASSAGE and duration is None):
        return None, {}
    departure = target if direction == Direction.DISPERSION else target - timedelta(seconds=duration)
    for _ in range(3 if direction == Direction.RAMASSAGE else 1):
        if departure <= now:
            return None, {}
        route = await provider.route(coords, depart_at=departure)
        arrival = departure + timedelta(seconds=route.duration_s)
        schedule = {"estimated_departure_at": departure, "estimated_arrival_at": arrival,
                    "estimation_basis": "traffic"}
        if direction == Direction.DISPERSION or abs((arrival - target).total_seconds()) < 60:
            return route, schedule
        # Keep the actual queried departure/arrival pair if refinement does not converge.
        departure = target - timedelta(seconds=route.duration_s)
    return route, schedule
