"""Modèles SQLAlchemy 2.0 (async) — persistance Postgres.

La base est partagée entre deux instances backend (TrueNAS + secours cloud),
donc les migrations passent par Alembic plutôt que par `Base.metadata.create_all()`
au démarrage, qui serait une source de course entre les deux instances.
"""

from __future__ import annotations

import uuid
from datetime import date as date_
from datetime import datetime, timezone

from sqlalchemy import Date, DateTime, Float, ForeignKey, Index, Integer, LargeBinary, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

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


class User(Base):
    """Un compte, natif (mot de passe) et/ou Google — l'email est la clé
    d'identité commune aux deux : une connexion Google dont l'email
    correspond déjà à un compte mot de passe rattache l'un à l'autre plutôt
    que de dupliquer (Google vérifie lui-même la propriété de l'email, ce
    rattachement est donc sûr)."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_new_uuid)
    email: Mapped[str] = mapped_column(String(320), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    # Nul si le compte n'a jamais utilisé de mot de passe (connexion Google
    # uniquement). google_sub : identifiant stable Google (le champ `sub` du
    # jeton d'identité), nul si le compte n'a jamais utilisé Google.
    password_hash: Mapped[str | None] = mapped_column(String(200), nullable=True)
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


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
    event_date: Mapped[date_] = mapped_column(Date)
    # Message libre de l'organisateur, saisi à la création (pas un fil de
    # discussion ouvert aux inscrits) — consignes de rendez-vous, etc.
    description: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    # Nul pour les événements créés avant l'authentification (migration
    # 0003) : aucun utilisateur réel n'existe pour ces anciennes lignes,
    # inventer un rattachement serait pire que ne rien mettre. `SET NULL` à
    # la suppression du compte plutôt que `CASCADE` : supprimer un compte ne
    # doit pas supprimer les événements qu'il a créés.
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # Octets bruts en base plutôt qu'un service de stockage objet dédié : une
    # image de couverture par événement, petite, ne justifie pas une pièce
    # d'infra de plus à maintenir sur deux hôtes backend (cf. décision de
    # plan). content_type permet de resservir le bon en-tête sans deviner.
    # `deferred=True` : ces octets ne sont chargés que quand explicitement
    # demandés (`undefer`, cf. GET /events/{id}/cover-image dans routes.py)
    # — sinon chaque lecture d'événement rapatrierait jusqu'à 3 Mo pour rien.
    cover_image: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True, deferred=True)
    cover_image_content_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # Barème du partage de frais, ajustable par l'organisateur. Nuls = valeurs
    # par défaut du serveur (cf. Settings.default_fuel_price_per_l et
    # default_consumption_l_per_100km) : centraliser les défauts côté serveur
    # garantit que tous les clients (et les deux instances backend) affichent
    # le même chiffre, ajustable sans redéployer le frontend. Ce sont des
    # molettes de réglage, pas de la comptabilité : Float suffit, pas besoin
    # de Numeric.
    fuel_price_per_l: Mapped[float | None] = mapped_column(Float, nullable=True)
    consumption_l_per_100km: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Devise du partage de frais, ajustable par l'organisateur. Nulle =
    # jamais choisie -> le client applique EUR par défaut (cf. lib/cost.ts
    # DEFAULT_CURRENCY), même principe de défaut partagé que les deux champs
    # ci-dessus.
    currency: Mapped[str | None] = mapped_column(String(3), nullable=True)

    @property
    def has_cover_image(self) -> bool:
        # Vérifie `cover_image_content_type` (jamais différé, toujours posé
        # en même temps que `cover_image` à l'upload/suppression) plutôt que
        # `cover_image` lui-même : ce dernier est `deferred`, y accéder ici
        # déclencherait justement le chargement qu'on veut éviter.
        return self.cover_image_content_type is not None

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
    # Nul pour les inscriptions faites avant l'authentification — cf.
    # `Event.owner_id` pour le même raisonnement.
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

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
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    event: Mapped["Event"] = relationship(back_populates="passengers")


class SolutionRecord(Base):
    """Nommé `SolutionRecord` (et pas `Solution`) pour ne pas entrer en collision
    avec `app.solver.model.Solution`, le type pur renvoyé par le solveur."""

    __tablename__ = "solutions"
    __table_args__ = (
        # `_load_latest_solution_record_or_404` (routes.py) trie exactement
        # là-dessus pour prendre la plus récente d'un (event, direction) ;
        # sans cet index composite, chaque lecture de solution balaie toutes
        # les lignes de l'événement. Ascendant suffit : un btree se parcourt
        # aussi bien à l'envers pour un `ORDER BY created_at DESC LIMIT 1`.
        Index("ix_solutions_event_direction_created", "event_id", "direction", "created_at"),
    )

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


class EventLog(Base):
    """Télémétrie serveur minimale : un fait métier par ligne (événement créé,
    inscription, calcul lancé...). Volontairement séparée de PostHog (parcours
    et entonnoirs côté navigateur, cf. lib/telemetry.ts) : un fait n'est
    journalisé qu'à l'endroit où il est vrai — le serveur sait ce qui a été
    écrit en base, le client sait ce que l'humain a vu et cliqué.

    `instance` (ex. "truenas"/"railway") rend enfin observable quelle instance
    sert le trafic — la question directe derrière les chantiers de failover.
    Aucune donnée personnelle dans `props` : uniquement des ids et des
    compteurs.
    """

    __tablename__ = "events_log"
    __table_args__ = (Index("ix_events_log_name_created_at", "name", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_new_uuid)
    # `server_default=func.now()` plutôt que le `default=_utcnow` applicatif
    # utilisé ailleurs dans ce fichier : c'est de l'ordonnancement entre deux
    # instances aux horloges potentiellement décalées, il doit venir de la
    # base plutôt que du process qui écrit.
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    name: Mapped[str] = mapped_column(String(50))
    instance: Mapped[str] = mapped_column(String(20))
    # SET NULL et non CASCADE : une ligne de journal doit survivre à la
    # suppression de l'événement ou du compte, sinon les statistiques se
    # réécrivent rétroactivement.
    event_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("events.id", ondelete="SET NULL"), nullable=True, index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    props: Mapped[dict] = mapped_column(JSONB, default=dict)


class GeocodeCacheEntry(Base):
    __tablename__ = "geocode_cache"

    address_norm: Mapped[str] = mapped_column(String(500), primary_key=True)
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    display_name: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
