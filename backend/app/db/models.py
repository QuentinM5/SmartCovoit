"""Modèles SQLAlchemy 2.0 (async) — persistance Postgres.

La base est partagée entre deux instances backend (TrueNAS + secours cloud),
donc les migrations passent par Alembic plutôt que par `Base.metadata.create_all()`
au démarrage, qui serait une source de course entre les deux instances.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.solver.model import Direction


def _new_uuid() -> uuid.UUID:
    return uuid.uuid4()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _direction_column() -> SAEnum:
    # values_callable : sans ça, SQLAlchemy sérialise un enum.Enum Python par
    # son .name ("RAMASSAGE") plutôt que sa .value ("ramassage"), qui ne
    # correspond pas aux valeurs du type Postgres créé par la migration. Une
    # fabrique plutôt qu'une instance partagée : chaque colonne a besoin de
    # son propre objet type (le réutiliser tel quel entre plusieurs colonnes
    # provoque des soucis de nommage de contrainte côté SQLAlchemy).
    return SAEnum(Direction, name="direction", values_callable=lambda enum_cls: [e.value for e in enum_cls])


class Event(Base):
    __tablename__ = "events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_new_uuid)
    name: Mapped[str] = mapped_column(String(200))
    # Le sens du trajet vit maintenant par inscription (Driver/Passenger),
    # pas au niveau de l'événement : un événement porte l'aller et le retour
    # à la fois, cf. migration 0002.
    depot_address: Mapped[str] = mapped_column(String(500))
    depot_lat: Mapped[float] = mapped_column(Float)
    depot_lon: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    # order_by explicite : le numérotage des nœuds passés au solveur dérive de
    # cet ordre, il doit être stable d'un chargement à l'autre.
    drivers: Mapped[list["Driver"]] = relationship(
        back_populates="event", cascade="all, delete-orphan", order_by="Driver.created_at"
    )
    passengers: Mapped[list["Passenger"]] = relationship(
        back_populates="event", cascade="all, delete-orphan", order_by="Passenger.created_at"
    )
    solutions: Mapped[list["SolutionRecord"]] = relationship(
        back_populates="event", cascade="all, delete-orphan", order_by="SolutionRecord.created_at"
    )


class Driver(Base):
    __tablename__ = "drivers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_new_uuid)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"))
    # S'inscrire aux deux sens = deux lignes (une par sens), même nom/adresse
    # — pas de table de jonction séparée, cf. migration 0002.
    direction: Mapped[Direction] = mapped_column(_direction_column())
    name: Mapped[str] = mapped_column(String(200))
    seats: Mapped[int] = mapped_column(Integer)
    address: Mapped[str] = mapped_column(String(500))
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    event: Mapped["Event"] = relationship(back_populates="drivers")


class Passenger(Base):
    __tablename__ = "passengers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_new_uuid)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"))
    direction: Mapped[Direction] = mapped_column(_direction_column())
    name: Mapped[str] = mapped_column(String(200))
    address: Mapped[str] = mapped_column(String(500))
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    event: Mapped["Event"] = relationship(back_populates="passengers")


class SolutionRecord(Base):
    """Nommé `SolutionRecord` (et pas `Solution`) pour ne pas entrer en collision
    avec `app.solver.model.Solution`, le type pur renvoyé par le solveur."""

    __tablename__ = "solutions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_new_uuid)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"))
    # Une tournée "aller" et une tournée "retour" sont deux historiques
    # indépendants pour le même événement.
    direction: Mapped[Direction] = mapped_column(_direction_column())
    total_distance_m: Mapped[int] = mapped_column(Integer)
    matrix_source: Mapped[str] = mapped_column(String(20))
    fallback_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    payload: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    event: Mapped["Event"] = relationship(back_populates="solutions")


class GeocodeCacheEntry(Base):
    __tablename__ = "geocode_cache"

    address_norm: Mapped[str] = mapped_column(String(500), primary_key=True)
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    display_name: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
