"""Schémas Pydantic des requêtes/réponses — documentés automatiquement par Swagger."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.solver.model import Direction


class EventCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    direction: Direction
    depot_address: str = Field(min_length=1, max_length=500)


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    direction: Direction
    depot_address: str
    depot_lat: float
    depot_lon: float
    created_at: datetime


class DriverCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    seats: int = Field(gt=0, le=20)
    address: str = Field(min_length=1, max_length=500)


class DriverOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    seats: int
    address: str
    lat: float
    lon: float


class PassengerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    address: str = Field(min_length=1, max_length=500)


class PassengerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    address: str
    lat: float
    lon: float


class EventDetailOut(EventOut):
    """Extension au-delà des endpoints minimaux du brief : nécessaire pour
    qu'une page événement affiche l'état courant (conducteurs/passagers déjà
    inscrits) sans dépendre d'un état client qui ne survivrait pas à un
    rechargement de page."""

    drivers: list[DriverOut]
    passengers: list[PassengerOut]


class StopOut(BaseModel):
    node: int
    passenger_id: uuid.UUID | None
    passenger_name: str | None
    cumulative_distance_m: int


class RouteOut(BaseModel):
    driver_id: uuid.UUID
    driver_name: str
    distance_m: int
    stops: list[StopOut]
    # Tracé routier réel (suite de points [lat, lon]) pour l'affichage sur la
    # carte. Absent si OSRM n'est pas disponible — le client relie alors les
    # arrêts en ligne droite. Optionnel aussi pour rester compatible avec les
    # solutions déjà stockées en base avant l'ajout de ce champ.
    geometry: list[list[float]] | None = None


class SolutionOut(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    total_distance_m: int
    matrix_source: str
    fallback_reason: str | None
    routes: list[RouteOut]
    created_at: datetime
