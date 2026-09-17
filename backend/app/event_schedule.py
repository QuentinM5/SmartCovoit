"""Event wall-clock times belong to the venue, never to the caller's timezone."""
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from zoneinfo import ZoneInfo

from app.solver.model import Direction


@lru_cache(maxsize=1)
def _finder():
    from timezonefinder import TimezoneFinder
    return TimezoneFinder(in_memory=False)


def timezone_for_location(lat: float, lon: float) -> str:
    name = _finder().timezone_at(lat=lat, lng=lon)
    if name is None:
        raise ValueError("Impossible de déterminer le fuseau horaire du lieu de l'événement.")
    return name


def local_instant(day, clock, zone: str) -> datetime:
    if clock.tzinfo is not None or clock.second or clock.microsecond:
        raise ValueError("Saisis une heure locale au format HH:MM, sans secondes ni fuseau.")
    wall = datetime.combine(day, clock)
    # fold=0 selects the first occurrence during the autumn clock change.
    instant = wall.replace(tzinfo=ZoneInfo(zone), fold=0).astimezone(timezone.utc)
    if instant.astimezone(ZoneInfo(zone)).replace(tzinfo=None) != wall:
        raise ValueError("Cette heure n'existe pas dans le fuseau du lieu à cause du changement d'heure.")
    return instant


def schedule_target(event, direction: Direction) -> datetime | None:
    clock = event.arrival_time if direction == Direction.RAMASSAGE else event.departure_time
    if clock is None:
        return None
    if not event.timezone:
        raise ValueError("Le fuseau horaire du lieu est nécessaire pour utiliser cet horaire.")
    day = event.event_date
    if direction == Direction.DISPERSION and event.departure_next_day:
        day += timedelta(days=1)
    return local_instant(day, clock, event.timezone)


def validate_schedule(event) -> None:
    if event.event_date is None:
        raise ValueError("La date de l'événement ne peut pas être vide.")
    if event.departure_time is None:
        event.departure_next_day = False
    arrival = schedule_target(event, Direction.RAMASSAGE)
    departure = schedule_target(event, Direction.DISPERSION)
    if arrival is not None and departure is not None and departure < arrival:
        raise ValueError("La dispersion précède le rassemblement. Vérifie l'heure ou coche « Départ le lendemain ».")


def typical_schedule(event, direction: Direction, duration: int | None) -> dict:
    target = schedule_target(event, direction)
    if target is None or duration is None:
        return {}
    departure = target - timedelta(seconds=duration) if direction == Direction.RAMASSAGE else target
    return {"estimated_departure_at": departure,
            "estimated_arrival_at": departure + timedelta(seconds=duration),
            "estimation_basis": "typical"}
