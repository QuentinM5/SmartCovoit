"""Endpoints API — cf. brief pour la liste minimale.

`GET /events/{event_id}` est une extension au-delà de cette liste (cf.
`schemas.EventDetailOut`), nécessaire pour qu'une page événement affiche les
inscriptions déjà faites sans dépendre d'un état client volatile.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import TypeVar

import anyio
from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile
from fastapi.encoders import jsonable_encoder
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, undefer

from app.api import schemas
from app.api.deps import get_current_user, get_db, get_geocoder, get_matrix_provider, get_solve_semaphore
from app.core.config import Settings, get_settings
from app.core.security import (
    hash_password,
    issue_session_token,
    verify_google_id_token,
    verify_password,
)
from app.db.models import Driver, Event, Passenger, SolutionRecord, User
from app.distance.fallback import FallbackMatrixProvider
from app.distance.types import Coord, Polyline
from app.geocoding.nominatim import NominatimClient
from app.geocoding.types import GeocodingError
from app.solver.errors import SolverError
from app.solver.model import Direction, DriverSpec, PassengerSpec, Route as SolverRoute, SolveRequest
from app.solver.vrp import solve

router = APIRouter()

MAX_COVER_IMAGE_BYTES = 3 * 1024 * 1024
ALLOWED_COVER_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}

# Vérifié systématiquement même quand l'email n'existe pas ou n'a pas de mot
# de passe (cf. login ci-dessous) : sans ça, l'absence de hachage bcrypt
# (~100-300ms) rend la réponse mesurablement plus rapide pour un email
# inconnu que pour un mot de passe simplement faux — une énumération de
# comptes par le temps de réponse, pas par le contenu de l'erreur.
_LOGIN_TIMING_GUARD_HASH = hash_password("smartcovoit-timing-guard-not-a-real-account")


@router.get("/health")
async def health(
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, str]:
    # `instance` répond à la question directe des chantiers de failover :
    # laquelle des deux instances a effectivement servi cette requête. `db`
    # vérifie une vraie requête (pas juste que le process a démarré) — sans
    # ça un backend qui répond mais ne peut plus atteindre Neon se dirait
    # "ok".
    try:
        await db.execute(select(1))
        db_status = "ok"
    except Exception:  # la base peut être injoignable pour mille raisons ; toutes se valent ici.
        db_status = "erreur"
    return {"status": "ok", "instance": settings.instance_name, "db": db_status}


@router.post("/auth/signup", response_model=schemas.AuthOut, status_code=201)
async def signup(
    body: schemas.SignupIn,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> schemas.AuthOut:
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Un compte existe déjà avec cet email.")

    user = User(email=body.email, name=body.name, password_hash=hash_password(body.password))
    db.add(user)
    try:
        await db.commit()
    except IntegrityError:
        # Deux inscriptions concurrentes avec le même email (double clic,
        # deux onglets) : la contrainte unique protège la donnée, mais sans
        # ce filet la deuxième requête plante en 500 au lieu du même 409
        # propre que si la vérification ci-dessus l'avait détecté la première.
        await db.rollback()
        raise HTTPException(status_code=409, detail="Un compte existe déjà avec cet email.")
    await db.refresh(user)
    return schemas.AuthOut(
        token=issue_session_token(user.id, settings.jwt_secret),
        user=schemas.UserOut.model_validate(user),
    )


@router.post("/auth/login", response_model=schemas.AuthOut)
async def login(
    body: schemas.LoginIn,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> schemas.AuthOut:
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    # Le hachage est vérifié dans tous les cas, y compris email inconnu ou
    # compte sans mot de passe (contre `_LOGIN_TIMING_GUARD_HASH`) — cf. sa
    # définition plus haut sur le filet de temps de réponse. Même message
    # dans tous les cas : ne pas révéler quel cas précis s'est produit.
    password_hash = user.password_hash if user and user.password_hash else _LOGIN_TIMING_GUARD_HASH
    password_ok = verify_password(body.password, password_hash)
    if user is None or user.password_hash is None or not password_ok:
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect.")
    return schemas.AuthOut(
        token=issue_session_token(user.id, settings.jwt_secret),
        user=schemas.UserOut.model_validate(user),
    )


@router.post("/auth/google", response_model=schemas.AuthOut)
async def auth_google(
    body: schemas.GoogleAuthIn,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> schemas.AuthOut:
    if not settings.google_oauth_client_id:
        raise HTTPException(status_code=503, detail="La connexion Google n'est pas configurée sur ce serveur.")
    try:
        identity = verify_google_id_token(body.id_token, settings.google_oauth_client_id)
    except Exception as exc:  # bibliothèque externe, plusieurs causes possibles (signature, expiration,
        # mauvaise audience) — toutes se traduisent en 401 côté client, pas la peine de les distinguer.
        raise HTTPException(status_code=401, detail="Jeton Google invalide ou expiré.") from exc

    result = await db.execute(select(User).where(User.google_sub == identity.sub))
    user = result.scalar_one_or_none()
    if user is None:
        # Un compte mot de passe existe déjà avec cet email : on le
        # rattache plutôt que de créer un doublon — Google a déjà vérifié
        # la propriété de cet email, ce rattachement est donc sûr.
        result = await db.execute(select(User).where(User.email == identity.email))
        user = result.scalar_one_or_none()
        if user is not None:
            user.google_sub = identity.sub
        else:
            user = User(email=identity.email, name=identity.name, google_sub=identity.sub)
            db.add(user)
        try:
            await db.commit()
        except IntegrityError:
            # Deux connexions Google concurrentes pour le même compte tout
            # juste créé (deux onglets) : la ligne existe déjà côté base,
            # on la relit plutôt que de planter en 500 pour une course
            # inoffensive.
            await db.rollback()
            result = await db.execute(select(User).where(User.google_sub == identity.sub))
            user = result.scalar_one()
        else:
            await db.refresh(user)

    return schemas.AuthOut(
        token=issue_session_token(user.id, settings.jwt_secret),
        user=schemas.UserOut.model_validate(user),
    )


@router.get("/auth/me", response_model=schemas.UserOut)
async def get_me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.post("/events", response_model=schemas.EventOut, status_code=201)
async def create_event(
    body: schemas.EventCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    geocoder: NominatimClient = Depends(get_geocoder),
) -> Event:
    lat, lon = await _locate_or_422(geocoder, body.depot_address, body.coords)

    event_id = body.id or uuid.uuid4()
    event = Event(
        id=event_id,
        name=body.name,
        depot_address=body.depot_address,
        depot_lat=lat,
        depot_lon=lon,
        event_date=body.event_date,
        description=body.description,
        owner_id=current_user.id,
    )
    db.add(event)
    try:
        await db.commit()
    except IntegrityError:
        # Rejeu d'un POST déjà appliqué (cf. worker/failover-policy.ts : un
        # échec de transport sur le primaire peut rejouer une écriture déjà
        # traitée) : l'id est fourni par le client (app/page.tsx génère un
        # crypto.randomUUID() avant même la réponse serveur), donc un id qui
        # existe déjà signifie très probablement "même création, deuxième
        # tentative" plutôt qu'une vraie collision. On renvoie l'événement
        # existant plutôt que de planter en 500.
        await db.rollback()
        existing = await db.get(Event, event_id)
        if existing is not None:
            return existing
        raise
    await db.refresh(event)
    return event


@router.get("/events/{event_id}", response_model=schemas.EventDetailOut)
async def get_event(event_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Event:
    return await _load_event_with_participants(db, event_id)


@router.post("/events/{event_id}/cover-image", status_code=204, response_class=Response)
async def upload_cover_image(
    event_id: uuid.UUID,
    file: UploadFile,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    event = await _get_event_or_404(db, event_id)
    _check_owner_or_open(event, current_user)
    if file.content_type not in ALLOWED_COVER_IMAGE_TYPES:
        raise HTTPException(
            status_code=422, detail="Format d'image non pris en charge (jpeg, png ou webp uniquement)."
        )
    data = await file.read()
    if len(data) > MAX_COVER_IMAGE_BYTES:
        raise HTTPException(status_code=422, detail="Image trop volumineuse (3 Mo maximum).")

    event.cover_image = data
    event.cover_image_content_type = file.content_type
    await db.commit()
    return Response(status_code=204)


@router.get("/events/{event_id}/cover-image")
async def get_cover_image(event_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Response:
    # Publique, sans authentification : un événement partagé par lien doit
    # afficher son image de couverture sans que le visiteur soit connecté,
    # comme le reste de la lecture (cf. matrice d'autorisation du plan).
    stmt = select(Event).options(undefer(Event.cover_image)).where(Event.id == event_id)
    result = await db.execute(stmt)
    event = result.scalar_one_or_none()
    if event is None or event.cover_image is None:
        raise HTTPException(status_code=404, detail="Pas d'image de couverture pour cet événement.")
    return Response(
        content=event.cover_image,
        media_type=event.cover_image_content_type or "application/octet-stream",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.post("/events/{event_id}/drivers", response_model=schemas.DriverOut, status_code=201)
async def add_driver(
    event_id: uuid.UUID,
    body: schemas.DriverCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    geocoder: NominatimClient = Depends(get_geocoder),
    settings: Settings = Depends(get_settings),
) -> Driver:
    await _get_event_or_404(db, event_id)
    if body.id is not None:
        # Rejeu d'un POST déjà appliqué (cf. failover-policy.ts) : on renvoie
        # la ligne existante avant même de vérifier le plafond, sinon un
        # événement tout juste arrivé à la limite rejetterait le rejeu de sa
        # propre dernière inscription réussie.
        existing = await db.get(Driver, body.id)
        if existing is not None and existing.event_id == event_id:
            return existing
    if _participant_cap_reached(await _participant_count(db, event_id), settings.max_participants_per_event):
        raise HTTPException(
            status_code=422,
            detail=f"Cet événement a atteint son nombre maximum d'inscrits ({settings.max_participants_per_event}).",
        )
    lat, lon = await _locate_or_422(geocoder, body.address, body.coords)

    driver_id = body.id or uuid.uuid4()
    driver = Driver(
        id=driver_id,
        event_id=event_id,
        direction=body.direction,
        name=body.name,
        seats=body.seats,
        address=body.address,
        lat=lat,
        lon=lon,
        user_id=current_user.id,
    )
    db.add(driver)
    try:
        await db.commit()
    except IntegrityError:
        # Rejeu d'un POST déjà appliqué (cf. failover-policy.ts) : l'id est
        # fourni par le client, un id qui existe déjà est très probablement
        # la même inscription rejouée plutôt qu'une vraie collision.
        await db.rollback()
        existing = await db.get(Driver, driver_id)
        if existing is not None:
            return existing
        raise
    await db.refresh(driver)
    return driver


@router.post("/events/{event_id}/passengers", response_model=schemas.PassengerOut, status_code=201)
async def add_passenger(
    event_id: uuid.UUID,
    body: schemas.PassengerCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    geocoder: NominatimClient = Depends(get_geocoder),
    settings: Settings = Depends(get_settings),
) -> Passenger:
    await _get_event_or_404(db, event_id)
    if body.id is not None:
        existing = await db.get(Passenger, body.id)
        if existing is not None and existing.event_id == event_id:
            return existing
    if _participant_cap_reached(await _participant_count(db, event_id), settings.max_participants_per_event):
        raise HTTPException(
            status_code=422,
            detail=f"Cet événement a atteint son nombre maximum d'inscrits ({settings.max_participants_per_event}).",
        )
    lat, lon = await _locate_or_422(geocoder, body.address, body.coords)

    passenger_id = body.id or uuid.uuid4()
    passenger = Passenger(
        id=passenger_id,
        event_id=event_id,
        direction=body.direction,
        name=body.name,
        address=body.address,
        lat=lat,
        lon=lon,
        user_id=current_user.id,
    )
    db.add(passenger)
    try:
        await db.commit()
    except IntegrityError:
        # Cf. add_driver : rejeu d'un POST déjà appliqué.
        await db.rollback()
        existing = await db.get(Passenger, passenger_id)
        if existing is not None:
            return existing
        raise
    await db.refresh(passenger)
    return passenger


@router.delete("/events/{event_id}/drivers/{driver_id}", status_code=204, response_class=Response)
async def remove_driver(
    event_id: uuid.UUID,
    driver_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    driver = await _get_participant_or_404(db, Driver, event_id, driver_id)
    event = await _get_event_or_404(db, event_id)
    if not _can_remove_participant(event, driver.user_id, current_user):
        raise HTTPException(status_code=403, detail="Tu ne peux retirer que ta propre inscription.")
    await db.delete(driver)
    await db.commit()
    return Response(status_code=204)


@router.delete("/events/{event_id}/passengers/{passenger_id}", status_code=204, response_class=Response)
async def remove_passenger(
    event_id: uuid.UUID,
    passenger_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    passenger = await _get_participant_or_404(db, Passenger, event_id, passenger_id)
    event = await _get_event_or_404(db, event_id)
    if not _can_remove_participant(event, passenger.user_id, current_user):
        raise HTTPException(status_code=403, detail="Tu ne peux retirer que ta propre inscription.")
    await db.delete(passenger)
    await db.commit()
    return Response(status_code=204)


@router.post("/events/{event_id}/solve", response_model=schemas.SolutionOut, status_code=201)
async def solve_event(
    event_id: uuid.UUID,
    direction: Direction,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    matrix_provider: FallbackMatrixProvider = Depends(get_matrix_provider),
    settings: Settings = Depends(get_settings),
    solve_semaphore: anyio.Semaphore = Depends(get_solve_semaphore),
) -> schemas.SolutionOut:
    event = await _load_event_with_participants(db, event_id)
    # Réservé à l'organisateur : c'est lui qui décide de (re)calculer les
    # tournées, pas n'importe quel inscrit — cf. matrice d'autorisation du plan.
    _check_owner_or_open(event, current_user)
    drivers = [d for d in event.drivers if d.direction == direction]
    passengers = [p for p in event.passengers if p.direction == direction]

    if not drivers:
        raise HTTPException(status_code=422, detail="Aucun conducteur inscrit pour ce trajet.")

    # Anti-rafale : chaque calcul relance la matrice complète (payante côté
    # Google Routes) et OR-Tools — un double clic ou une bascule de failover
    # ne doit pas relancer deux calculs coup sur coup pour le même trajet.
    last_solved_at = await db.scalar(
        select(func.max(SolutionRecord.created_at)).where(
            SolutionRecord.event_id == event_id, SolutionRecord.direction == direction
        )
    )
    wait_s = _seconds_until_next_solve(last_solved_at, datetime.now(timezone.utc), settings.solve_cooldown_s)
    if wait_s > 0:
        raise HTTPException(
            status_code=429,
            detail=f"Un calcul vient d'être lancé pour ce trajet. Réessaie dans {round(wait_s)} s.",
            headers={"Retry-After": str(round(wait_s))},
        )

    coords = [Coord(event.depot_lat, event.depot_lon)]
    coords += [Coord(d.lat, d.lon) for d in drivers]
    coords += [Coord(p.lat, p.lon) for p in passengers]

    matrix_result = await matrix_provider.matrix(coords)

    num_drivers = len(drivers)
    driver_specs = [
        DriverSpec(id=str(d.id), name=d.name, seats=d.seats, node=1 + i)
        for i, d in enumerate(drivers)
    ]
    passenger_specs = [
        PassengerSpec(id=str(p.id), name=p.name, node=1 + num_drivers + i)
        for i, p in enumerate(passengers)
    ]

    solve_request = SolveRequest(
        direction=direction,
        distance_matrix=matrix_result.distances,
        duration_matrix=matrix_result.durations,
        drivers=driver_specs,
        passengers=passenger_specs,
        time_limit_s=settings.solver_time_limit_s,
    )

    try:
        # OR-Tools est bloquant (CPU) : on l'exécute hors de la boucle
        # d'événements pour ne pas geler les autres requêtes pendant le solve.
        # Le sémaphore borne le nombre de threads CPU-bound simultanés
        # (cf. Settings.max_concurrent_solves) plutôt que d'en laisser
        # démarrer un par requête sans limite.
        async with solve_semaphore:
            solution = await anyio.to_thread.run_sync(solve, solve_request)
    except SolverError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    driver_uuid_by_str = {str(d.id): d.id for d in drivers}
    passenger_uuid_by_str = {str(p.id): p.id for p in passengers}
    passenger_name_by_str = {str(p.id): p.name for p in passengers}

    # Tracés routiers réels, en parallèle : purement pour l'affichage, et
    # renvoyés à `None` un par un si OSRM ne suit pas (cf. FallbackMatrixProvider).
    # Bornée à 4 en vol plutôt qu'un gather sans limite : un événement à
    # 40 conducteurs ne doit pas ouvrir 40 requêtes OSRM/Google d'un coup.
    geometry_semaphore = asyncio.Semaphore(4)

    async def _bounded_route_geometry(route: SolverRoute) -> Polyline | None:
        async with geometry_semaphore:
            return await matrix_provider.route_geometry([coords[stop.node] for stop in route.stops])

    geometries = await asyncio.gather(*(_bounded_route_geometry(route) for route in solution.routes))

    routes_out = [
        schemas.RouteOut(
            driver_id=driver_uuid_by_str[route.driver_id],
            driver_name=route.driver_name,
            distance_m=route.distance_m,
            duration_s=route.duration_s,
            geometry=geometry,
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
                    cumulative_duration_s=stop.cumulative_duration_s,
                )
                for stop in route.stops
            ],
        )
        for route, geometry in zip(solution.routes, geometries)
    ]

    record = SolutionRecord(
        event_id=event.id,
        direction=direction,
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
        direction=direction,
        total_distance_m=record.total_distance_m,
        total_duration_s=solution.total_duration_s,
        matrix_source=record.matrix_source,
        fallback_reason=record.fallback_reason,
        routes=routes_out,
        created_at=record.created_at,
    )


@router.get("/events/{event_id}/solution", response_model=schemas.SolutionOut)
async def get_latest_solution(
    event_id: uuid.UUID, direction: Direction, db: AsyncSession = Depends(get_db)
) -> schemas.SolutionOut:
    await _get_event_or_404(db, event_id)
    record = await _load_latest_solution_record_or_404(db, event_id, direction)
    routes_out = [schemas.RouteOut.model_validate(r) for r in record.payload]

    return schemas.SolutionOut(
        id=record.id,
        event_id=record.event_id,
        direction=direction,
        total_distance_m=record.total_distance_m,
        total_duration_s=_total_duration_s(routes_out),
        matrix_source=record.matrix_source,
        fallback_reason=record.fallback_reason,
        routes=routes_out,
        created_at=record.created_at,
    )


@router.post("/events/{event_id}/solution/move-stop", response_model=schemas.SolutionOut, status_code=201)
async def move_stop(
    event_id: uuid.UUID,
    body: schemas.MoveStopIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    matrix_provider: FallbackMatrixProvider = Depends(get_matrix_provider),
    settings: Settings = Depends(get_settings),
) -> schemas.SolutionOut:
    """Déplace un passager vers une tournée après un calcul (glisser-déposer
    côté client). `driver_id` peut être le conducteur déjà actuel du
    passager : retirer puis réinsérer via l'insertion la moins chère
    recalcule alors simplement sa meilleure position parmi les arrêts déjà
    présents — pas de chemin de code séparé pour le réordonnancement
    intra-tournée.

    Réservé à l'organisateur, comme le calcul initial (cf. matrice
    d'autorisation du plan) : c'est lui qui réorganise les tournées.

    Surcapacité volontairement autorisée (pas de 422) : cohérent avec
    l'indicateur `seatsLeft < 0` déjà affiché côté événement plutôt qu'un
    blocage.
    """
    event = await _load_event_with_participants(db, event_id)
    _check_owner_or_open(event, current_user)

    passenger = next((p for p in event.passengers if p.id == body.passenger_id), None)
    if passenger is None:
        raise HTTPException(status_code=404, detail="Passager introuvable pour cet événement.")
    target_driver = next((d for d in event.drivers if d.id == body.driver_id), None)
    if target_driver is None:
        raise HTTPException(status_code=404, detail="Conducteur introuvable pour cet événement.")
    if target_driver.direction != passenger.direction:
        raise HTTPException(
            status_code=422, detail="Ce conducteur n'est pas inscrit pour le même trajet que ce passager."
        )
    direction = passenger.direction

    record = await _load_latest_solution_record_or_404(db, event_id, direction)
    routes = [schemas.RouteOut.model_validate(r) for r in record.payload]

    source_idx = next(
        (i for i, r in enumerate(routes) if any(s.passenger_id == passenger.id for s in r.stops)), None
    )
    if source_idx is None:
        raise HTTPException(
            status_code=422, detail="Ce passager n'apparaît dans aucune tournée de la solution actuelle."
        )
    target_idx = next((i for i, r in enumerate(routes) if r.driver_id == target_driver.id), None)
    if target_idx is None:
        raise HTTPException(status_code=422, detail="Ce conducteur n'a pas de tournée dans la solution actuelle.")

    source_route = routes[source_idx]
    target_route = routes[target_idx]
    passenger_node = next(s.node for s in source_route.stops if s.passenger_id == passenger.id)

    base_target_stops = [
        s for s in (source_route.stops if source_idx == target_idx else target_route.stops)
        if s.passenger_id != passenger.id
    ]
    base_target_coords = [_stop_coord(s, event, target_driver) for s in base_target_stops]

    (
        new_target_stops,
        target_distance,
        target_duration,
        target_source,
        target_fallback,
        target_geometry,
    ) = await _reinsert_passenger(matrix_provider, base_target_stops, base_target_coords, passenger, passenger_node)

    if source_idx == target_idx:
        unchanged = [s.passenger_id for s in source_route.stops] == [s.passenger_id for s in new_target_stops]
        if unchanged:
            return schemas.SolutionOut(
                id=record.id,
                event_id=event.id,
                direction=direction,
                total_distance_m=record.total_distance_m,
                total_duration_s=_total_duration_s(routes),
                matrix_source=record.matrix_source,
                fallback_reason=record.fallback_reason,
                routes=routes,
                created_at=record.created_at,
            )

    sources_used = [target_source]
    fallback_reasons = [target_fallback]
    new_routes = list(routes)
    new_routes[target_idx] = schemas.RouteOut(
        driver_id=target_route.driver_id,
        driver_name=target_route.driver_name,
        distance_m=target_distance,
        duration_s=target_duration,
        stops=new_target_stops,
        geometry=target_geometry,
    )

    if source_idx != target_idx:
        remaining_source_stops = [s for s in source_route.stops if s.passenger_id != passenger.id]
        source_driver = next(d for d in event.drivers if d.id == source_route.driver_id)
        remaining_source_coords = [_stop_coord(s, event, source_driver) for s in remaining_source_stops]
        (
            new_source_stops,
            source_distance,
            source_duration,
            source_source,
            source_fallback,
            source_geometry,
        ) = await _recompute_fixed_order(matrix_provider, remaining_source_stops, remaining_source_coords)
        sources_used.append(source_source)
        fallback_reasons.append(source_fallback)
        new_routes[source_idx] = schemas.RouteOut(
            driver_id=source_route.driver_id,
            driver_name=source_route.driver_name,
            distance_m=source_distance,
            duration_s=source_duration,
            stops=new_source_stops,
            geometry=source_geometry,
        )

    total_distance = sum(r.distance_m for r in new_routes)
    durations = [r.duration_s for r in new_routes]
    total_duration = sum(durations) if all(d is not None for d in durations) else None  # type: ignore[arg-type]

    source_priority = {"google": 0, "osrm": 1, "haversine": 2}
    worst_source = max(sources_used, key=lambda s: source_priority[s])
    combined_fallback_reason = next((r for r in fallback_reasons if r), None)

    new_record = SolutionRecord(
        event_id=event.id,
        direction=direction,
        total_distance_m=total_distance,
        matrix_source=worst_source,
        fallback_reason=combined_fallback_reason,
        payload=jsonable_encoder(new_routes),
    )
    db.add(new_record)
    # Flush (pas commit) : attribue id/created_at à new_record pour pouvoir
    # le comparer aux autres lignes ci-dessous, sans encore valider la
    # transaction.
    await db.flush()

    # Un geste de glisser-déposer insère une ligne à chaque fois : sans
    # purge, l'historique d'un événement très manipulé croît sans borne.
    # Dans la même transaction que l'insertion, pour ne jamais valider l'une
    # sans l'autre.
    existing_records = (
        await db.scalars(
            select(SolutionRecord).where(
                SolutionRecord.event_id == event.id, SolutionRecord.direction == direction
            )
        )
    ).all()
    for stale in _records_to_prune(list(existing_records), settings.max_solutions_kept_per_direction):
        if stale.id != new_record.id:
            await db.delete(stale)

    await db.commit()
    await db.refresh(new_record)

    return schemas.SolutionOut(
        id=new_record.id,
        event_id=event.id,
        direction=direction,
        total_distance_m=total_distance,
        total_duration_s=total_duration,
        matrix_source=new_record.matrix_source,
        fallback_reason=new_record.fallback_reason,
        routes=new_routes,
        created_at=new_record.created_at,
    )


async def _participant_count(db: AsyncSession, event_id: uuid.UUID) -> int:
    """Conducteurs + passagers, tous sens confondus : c'est la taille qui
    borne la matrice de /solve, pas le nombre par sens."""
    driver_count = await db.scalar(
        select(func.count()).select_from(Driver).where(Driver.event_id == event_id)
    )
    passenger_count = await db.scalar(
        select(func.count()).select_from(Passenger).where(Passenger.event_id == event_id)
    )
    return (driver_count or 0) + (passenger_count or 0)


def _total_duration_s(routes: list[schemas.RouteOut]) -> int | None:
    """Recalculée depuis `payload` plutôt que stockée en colonne séparée —
    `total_distance_m` a une colonne dédiée pour trier/filtrer dessus côté
    SQL, ce dont `total_duration_s` n'a pas besoin (jamais interrogé hors
    de sa propre solution)."""
    durations = [r.duration_s for r in routes]
    if any(d is None for d in durations):
        return None
    return sum(durations)


async def _get_event_or_404(db: AsyncSession, event_id: uuid.UUID) -> Event:
    event = await db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Événement introuvable.")
    return event


async def _load_event_with_participants(db: AsyncSession, event_id: uuid.UUID) -> Event:
    stmt = (
        select(Event)
        .options(
            selectinload(Event.drivers),
            selectinload(Event.passengers),
        )
        .where(Event.id == event_id)
    )
    result = await db.execute(stmt)
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=404, detail="Événement introuvable.")
    return event


def _check_owner_or_open(event: Event, current_user: User) -> None:
    """Autorise si l'événement n'a pas encore de propriétaire (créé avant
    l'authentification, cf. migration 0003) ou si l'utilisateur connecté en
    est le propriétaire. Lève 403 sinon."""
    if event.owner_id is not None and event.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Seul l'organisateur de cet événement peut faire ça.")


def _can_remove_participant(event: Event, participant_user_id: uuid.UUID | None, current_user: User) -> bool:
    """Cf. matrice d'autorisation du plan : la personne elle-même, une
    ancienne inscription sans propriétaire connu, un événement sans
    organisateur connu, ou l'organisateur lui-même."""
    return (
        participant_user_id == current_user.id
        or participant_user_id is None
        or event.owner_id is None
        or event.owner_id == current_user.id
    )


def _participant_cap_reached(current_count: int, cap: int) -> bool:
    return current_count >= cap


def _seconds_until_next_solve(last_solved_at: datetime | None, now: datetime, cooldown_s: int) -> float:
    """Aucun calcul précédent -> pas d'attente. Sinon, ce qui reste du
    cooldown depuis le dernier calcul de cet (événement, sens) — jamais
    négatif."""
    if last_solved_at is None:
        return 0.0
    elapsed = (now - last_solved_at).total_seconds()
    return max(0.0, cooldown_s - elapsed)


def _records_to_prune(records: list[SolutionRecord], keep: int) -> list[SolutionRecord]:
    """Renvoie les enregistrements au-delà des `keep` plus récents (peu
    importe leur ordre en entrée) — utilisé pour élaguer l'historique d'un
    (événement, sens) après un move-stop, qui insère une ligne à chaque
    geste."""
    ordered = sorted(records, key=lambda r: r.created_at, reverse=True)
    return ordered[keep:]


_Participant = TypeVar("_Participant", Driver, Passenger)


async def _get_participant_or_404(
    db: AsyncSession, model: type[_Participant], event_id: uuid.UUID, participant_id: uuid.UUID
) -> _Participant:
    """Charge un conducteur/passager en vérifiant qu'il appartient bien à cet
    événement — pas seulement qu'un tel id existe quelque part.

    Sans le filtre sur `event_id`, un id valide provenant d'un AUTRE
    événement (deviné, ou récupéré ailleurs) permettrait de supprimer un
    participant qui n'apparaît même pas sur la page consultée.
    """
    stmt = select(model).where(model.id == participant_id, model.event_id == event_id)
    result = await db.execute(stmt)
    participant = result.scalar_one_or_none()
    if participant is None:
        raise HTTPException(status_code=404, detail="Participant introuvable pour cet événement.")
    return participant


async def _load_latest_solution_record_or_404(
    db: AsyncSession, event_id: uuid.UUID, direction: Direction
) -> SolutionRecord:
    stmt = (
        select(SolutionRecord)
        .where(SolutionRecord.event_id == event_id, SolutionRecord.direction == direction)
        .order_by(SolutionRecord.created_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=404, detail="Aucune solution calculée pour ce trajet.")
    return record


def _stop_coord(stop: schemas.StopOut, event: Event, route_driver: Driver) -> Coord:
    """Coordonnée d'un arrêt déjà résolu dans une tournée — même logique que
    `resolveStops` côté frontend (lib/route.ts) : un passager par son id, le
    nœud 0 c'est le dépôt, sinon c'est le domicile du conducteur de cette
    tournée."""
    if stop.passenger_id is not None:
        passenger = next(p for p in event.passengers if p.id == stop.passenger_id)
        return Coord(passenger.lat, passenger.lon)
    if stop.node == 0:
        return Coord(event.depot_lat, event.depot_lon)
    return Coord(route_driver.lat, route_driver.lon)


async def _reinsert_passenger(
    matrix_provider: FallbackMatrixProvider,
    base_stops: list[schemas.StopOut],
    base_coords: list[Coord],
    passenger: Passenger,
    passenger_node: int,
) -> tuple[list[schemas.StopOut], int, int | None, str, str | None, list[list[float]] | None]:
    """Retrouve la position la moins chère pour insérer `passenger` parmi les
    arrêts restants d'une tournée (bornes dépôt/domicile incluses dans
    `base_stops`/`base_coords`, dans leur ordre actuel — jamais avant le
    premier ni après le dernier, ce sont les extrémités fixes du trajet) et
    recalcule la tournée complète. Un seul appel matrice, réutilisé à la
    fois pour choisir la position et pour les distances/durées cumulées
    finales — même principe que l'heuristique d'insertion la moins chère
    utilisée pour construire un VRP, appliqué ici en O(k) sur une seule
    petite tournée."""
    n = len(base_coords)
    passenger_coord = Coord(passenger.lat, passenger.lon)
    coords_with_passenger = base_coords + [passenger_coord]  # index n = passager
    matrix_result = await matrix_provider.matrix(coords_with_passenger)
    cost_matrix = matrix_result.durations if matrix_result.durations is not None else matrix_result.distances

    best_k, best_added = 1, None
    for k in range(1, n):
        added = cost_matrix[k - 1][n] + cost_matrix[n][k] - cost_matrix[k - 1][k]
        if best_added is None or added < best_added:
            best_added, best_k = added, k

    # Ordre final exprimé en index dans coords_with_passenger (0..n-1 = base, n = passager).
    order = list(range(best_k)) + [n] + list(range(best_k, n))
    final_coords = [coords_with_passenger[i] for i in order]
    geometry = await matrix_provider.route_geometry(final_coords)

    stops: list[schemas.StopOut] = []
    cumulative_d = 0
    cumulative_t = 0 if matrix_result.durations is not None else None
    for pos, idx in enumerate(order):
        if pos > 0:
            prev = order[pos - 1]
            cumulative_d += matrix_result.distances[prev][idx]
            if cumulative_t is not None:
                cumulative_t += matrix_result.durations[prev][idx]
        if idx == n:
            stops.append(
                schemas.StopOut(
                    node=passenger_node,
                    passenger_id=passenger.id,
                    passenger_name=passenger.name,
                    cumulative_distance_m=cumulative_d,
                    cumulative_duration_s=cumulative_t,
                )
            )
        else:
            old = base_stops[idx]
            stops.append(
                schemas.StopOut(
                    node=old.node,
                    passenger_id=old.passenger_id,
                    passenger_name=old.passenger_name,
                    cumulative_distance_m=cumulative_d,
                    cumulative_duration_s=cumulative_t,
                )
            )

    return stops, cumulative_d, cumulative_t, matrix_result.source, matrix_result.fallback_reason, geometry


async def _recompute_fixed_order(
    matrix_provider: FallbackMatrixProvider,
    stops: list[schemas.StopOut],
    coords: list[Coord],
) -> tuple[list[schemas.StopOut], int, int | None, str, str | None, list[list[float]] | None]:
    """Recalcule les distances/durées cumulées et le tracé d'une tournée dont
    l'ordre des arrêts est déjà décidé (cas : un passager vient d'en être
    retiré, le reste ne bouge pas)."""
    matrix_result = await matrix_provider.matrix(coords)
    geometry = await matrix_provider.route_geometry(coords)

    new_stops: list[schemas.StopOut] = []
    cumulative_d = 0
    cumulative_t = 0 if matrix_result.durations is not None else None
    for i, old in enumerate(stops):
        if i > 0:
            cumulative_d += matrix_result.distances[i - 1][i]
            if cumulative_t is not None:
                cumulative_t += matrix_result.durations[i - 1][i]
        new_stops.append(
            schemas.StopOut(
                node=old.node,
                passenger_id=old.passenger_id,
                passenger_name=old.passenger_name,
                cumulative_distance_m=cumulative_d,
                cumulative_duration_s=cumulative_t,
            )
        )
    return new_stops, cumulative_d, cumulative_t, matrix_result.source, matrix_result.fallback_reason, geometry


async def _locate_or_422(
    geocoder: NominatimClient, address: str, provided: tuple[float, float] | None
) -> tuple[float, float]:
    """Position de l'adresse : celle fournie par le client si elle existe,
    sinon géocodage côté serveur.

    Le champ d'autocomplétion connaît déjà la position exacte du lieu choisi.
    La réutiliser évite un second géocodage sur le seul libellé texte, qui peut
    retomber sur une commune homonyme — et épargne un appel réseau au passage.
    """
    if provided is not None:
        return provided

    try:
        result = await geocoder.geocode(address)
    except GeocodingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return (result.lat, result.lon)
