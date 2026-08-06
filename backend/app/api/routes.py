"""Endpoints API — cf. brief pour la liste minimale.

`GET /events/{event_id}` est une extension au-delà de cette liste (cf.
`schemas.EventDetailOut`), nécessaire pour qu'une page événement affiche les
inscriptions déjà faites sans dépendre d'un état client volatile.
"""

from __future__ import annotations

import uuid

import anyio
from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import schemas
from app.api.deps import get_db, get_geocoder, get_matrix_provider
from app.core.config import Settings, get_settings
from app.db.models import Driver, Event, Passenger, SolutionRecord
from app.distance.fallback import FallbackMatrixProvider
from app.distance.types import Coord
from app.geocoding.nominatim import NominatimClient
from app.geocoding.types import GeocodingError
from app.solver.errors import SolverError
from app.solver.model import DriverSpec, PassengerSpec, SolveRequest
from app.solver.vrp import solve

router = APIRouter()


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/events", response_model=schemas.EventOut, status_code=201)
async def create_event(
    body: schemas.EventCreate,
    db: AsyncSession = Depends(get_db),
    geocoder: NominatimClient = Depends(get_geocoder),
) -> Event:
    geocoded = await _geocode_or_422(geocoder, body.depot_address)

    event = Event(
        name=body.name,
        direction=body.direction,
        depot_address=body.depot_address,
        depot_lat=geocoded.lat,
        depot_lon=geocoded.lon,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return event


@router.get("/events/{event_id}", response_model=schemas.EventDetailOut)
async def get_event(event_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Event:
    return await _load_event_with_participants(db, event_id)


@router.post("/events/{event_id}/drivers", response_model=schemas.DriverOut, status_code=201)
async def add_driver(
    event_id: uuid.UUID,
    body: schemas.DriverCreate,
    db: AsyncSession = Depends(get_db),
    geocoder: NominatimClient = Depends(get_geocoder),
) -> Driver:
    await _get_event_or_404(db, event_id)
    geocoded = await _geocode_or_422(geocoder, body.address)

    driver = Driver(
        event_id=event_id,
        name=body.name,
        seats=body.seats,
        address=body.address,
        lat=geocoded.lat,
        lon=geocoded.lon,
    )
    db.add(driver)
    await db.commit()
    await db.refresh(driver)
    return driver


@router.post("/events/{event_id}/passengers", response_model=schemas.PassengerOut, status_code=201)
async def add_passenger(
    event_id: uuid.UUID,
    body: schemas.PassengerCreate,
    db: AsyncSession = Depends(get_db),
    geocoder: NominatimClient = Depends(get_geocoder),
) -> Passenger:
    await _get_event_or_404(db, event_id)
    geocoded = await _geocode_or_422(geocoder, body.address)

    passenger = Passenger(
        event_id=event_id,
        name=body.name,
        address=body.address,
        lat=geocoded.lat,
        lon=geocoded.lon,
    )
    db.add(passenger)
    await db.commit()
    await db.refresh(passenger)
    return passenger


@router.post("/events/{event_id}/solve", response_model=schemas.SolutionOut, status_code=201)
async def solve_event(
    event_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    matrix_provider: FallbackMatrixProvider = Depends(get_matrix_provider),
    settings: Settings = Depends(get_settings),
) -> schemas.SolutionOut:
    event = await _load_event_with_participants(db, event_id)

    if not event.drivers:
        raise HTTPException(status_code=422, detail="Aucun conducteur inscrit pour cet événement.")

    coords = [Coord(event.depot_lat, event.depot_lon)]
    coords += [Coord(d.lat, d.lon) for d in event.drivers]
    coords += [Coord(p.lat, p.lon) for p in event.passengers]

    matrix_result = await matrix_provider.matrix(coords)

    num_drivers = len(event.drivers)
    driver_specs = [
        DriverSpec(id=str(d.id), name=d.name, seats=d.seats, node=1 + i)
        for i, d in enumerate(event.drivers)
    ]
    passenger_specs = [
        PassengerSpec(id=str(p.id), name=p.name, node=1 + num_drivers + i)
        for i, p in enumerate(event.passengers)
    ]

    solve_request = SolveRequest(
        direction=event.direction,
        distance_matrix=matrix_result.distances,
        drivers=driver_specs,
        passengers=passenger_specs,
        time_limit_s=settings.solver_time_limit_s,
    )

    try:
        # OR-Tools est bloquant (CPU) : on l'exécute hors de la boucle
        # d'événements pour ne pas geler les autres requêtes pendant le solve.
        solution = await anyio.to_thread.run_sync(solve, solve_request)
    except SolverError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    driver_uuid_by_str = {str(d.id): d.id for d in event.drivers}
    passenger_uuid_by_str = {str(p.id): p.id for p in event.passengers}
    passenger_name_by_str = {str(p.id): p.name for p in event.passengers}

    routes_out = [
        schemas.RouteOut(
            driver_id=driver_uuid_by_str[route.driver_id],
            driver_name=route.driver_name,
            distance_m=route.distance_m,
            stops=[
                schemas.StopOut(
                    node=stop.node,
                    passenger_id=passenger_uuid_by_str.get(stop.passenger_id)
                    if stop.passenger_id
                    else None,
                    passenger_name=passenger_name_by_str.get(stop.passenger_id)
                    if stop.passenger_id
                    else None,
                    cumulative_distance_m=stop.cumulative_distance_m,
                )
                for stop in route.stops
            ],
        )
        for route in solution.routes
    ]

    record = SolutionRecord(
        event_id=event.id,
        total_distance_m=solution.total_distance_m,
        matrix_source=matrix_result.source,
        fallback_reason=matrix_result.fallback_reason,
        payload=jsonable_encoder(routes_out),
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)

    return schemas.SolutionOut(
        id=record.id,
        event_id=event.id,
        total_distance_m=record.total_distance_m,
        matrix_source=record.matrix_source,
        fallback_reason=record.fallback_reason,
        routes=routes_out,
        created_at=record.created_at,
    )


@router.get("/events/{event_id}/solution", response_model=schemas.SolutionOut)
async def get_latest_solution(event_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> schemas.SolutionOut:
    await _get_event_or_404(db, event_id)

    stmt = (
        select(SolutionRecord)
        .where(SolutionRecord.event_id == event_id)
        .order_by(SolutionRecord.created_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=404, detail="Aucune solution calculée pour cet événement.")

    routes_out = [schemas.RouteOut.model_validate(r) for r in record.payload]

    return schemas.SolutionOut(
        id=record.id,
        event_id=record.event_id,
        total_distance_m=record.total_distance_m,
        matrix_source=record.matrix_source,
        fallback_reason=record.fallback_reason,
        routes=routes_out,
        created_at=record.created_at,
    )


async def _get_event_or_404(db: AsyncSession, event_id: uuid.UUID) -> Event:
    event = await db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Événement introuvable.")
    return event


async def _load_event_with_participants(db: AsyncSession, event_id: uuid.UUID) -> Event:
    stmt = (
        select(Event)
        .options(selectinload(Event.drivers), selectinload(Event.passengers))
        .where(Event.id == event_id)
    )
    result = await db.execute(stmt)
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=404, detail="Événement introuvable.")
    return event


async def _geocode_or_422(geocoder: NominatimClient, address: str):
    try:
        return await geocoder.geocode(address)
    except GeocodingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
