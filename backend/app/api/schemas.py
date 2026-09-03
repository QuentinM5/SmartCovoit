"""Schémas Pydantic des requêtes/réponses — documentés automatiquement par Swagger."""

from __future__ import annotations

import uuid
from datetime import date as date_
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.solver.model import Direction


class SignupIn(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=200)
    # 72 = limite intrinsèque de bcrypt (les octets au-delà sont ignorés) —
    # mieux vaut le refuser explicitement que de tronquer silencieusement un
    # mot de passe plus long que ce que l'utilisateur croit avoir choisi.
    password: str = Field(min_length=8, max_length=72)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=72)


class GoogleAuthIn(BaseModel):
    # Jeton d'identité renvoyé par Google Identity Services côté client (pas
    # un code d'autorisation) — cf. décision 2 du plan.
    id_token: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    name: str


class AuthOut(BaseModel):
    token: str
    user: UserOut


class Located(BaseModel):
    """Coordonnées déjà connues de l'adresse saisie.

    Le client d'autocomplétion connaît déjà la position exacte du lieu choisi :
    la transmettre évite un second géocodage qui pourrait retomber sur une autre
    commune homonyme. Restent optionnelles — sans elles, l'adresse est géocodée
    côté serveur comme avant.
    """

    lat: float | None = Field(default=None, ge=-90, le=90)
    lon: float | None = Field(default=None, ge=-180, le=180)

    @property
    def coords(self) -> tuple[float, float] | None:
        if self.lat is None or self.lon is None:
            return None
        return (self.lat, self.lon)


class EventCreate(Located):
    name: str = Field(min_length=1, max_length=200)
    depot_address: str = Field(min_length=1, max_length=500)
    event_date: date_
    # Message libre de l'organisateur, saisi à la création — pas un fil de
    # discussion ouvert aux inscrits (cf. modèle `Event.description`).
    description: str | None = Field(default=None, max_length=2000)
    # Optionnel : généré côté client pour naviguer vers /events/{id} sans
    # attendre la réponse de ce POST (cf. app/page.tsx) ; absent, le serveur
    # en génère un comme avant. Collision UUID v4 : risque nul en pratique,
    # pas de traitement particulier au-delà de l'erreur d'intégrité naturelle.
    id: uuid.UUID | None = None


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    depot_address: str
    depot_lat: float
    depot_lon: float
    event_date: date_
    description: str | None
    created_at: datetime
    # Nul pour les événements créés avant l'authentification — cf. migration
    # 0003 et la matrice d'autorisation du plan.
    owner_id: uuid.UUID | None
    # Booléen calculé plutôt que les octets bruts : évite de gonfler cette
    # réponse JSON avec une image ; récupérée séparément via
    # GET /events/{id}/cover-image.
    has_cover_image: bool
    # Barème du partage de frais. Nuls = l'organisateur ne les a jamais
    # personnalisés ; le client applique alors les mêmes valeurs par défaut
    # que le serveur (cf. Settings.default_fuel_price_per_l et
    # default_consumption_l_per_100km) — le même barème par défaut partout
    # rend le montant affiché identique pour tous les participants, sans
    # avoir besoin de le résoudre côté serveur.
    fuel_price_per_l: float | None = None
    consumption_l_per_100km: float | None = None


class EventUpdate(Located):
    """Tous les champs optionnels : `model_dump(exclude_unset=True)` côté
    route distingue "absent du corps" (ne pas toucher) de "envoyé, y
    compris `null`" (remettre au défaut) — indispensable pour
    fuel_price_per_l/consumption_l_per_100km."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    event_date: date_ | None = None
    description: str | None = Field(default=None, max_length=2000)
    depot_address: str | None = Field(default=None, min_length=1, max_length=500)
    fuel_price_per_l: float | None = Field(default=None, gt=0)
    consumption_l_per_100km: float | None = Field(default=None, gt=0)


class MyEventOut(EventOut):
    """Cf. GET /events : un événement où le compte connecté est soit
    organisateur, soit inscrit (peu importe le sens)."""

    is_owner: bool
    my_directions: list[Direction]


class DriverCreate(Located):
    name: str = Field(min_length=1, max_length=200)
    seats: int = Field(gt=0, le=20)
    address: str = Field(min_length=1, max_length=500)
    direction: Direction
    # Optionnel : généré côté client (cf. EventCreate.id) pour que le rejeu
    # d'un POST par le worker de failover (échec de transport sur le
    # primaire) retombe sur la même ligne plutôt que d'en créer une
    # deuxième. Absent, le serveur en génère un comme avant.
    id: uuid.UUID | None = None


class DriverOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    seats: int
    address: str
    lat: float
    lon: float
    direction: Direction


class PassengerCreate(Located):
    name: str = Field(min_length=1, max_length=200)
    address: str = Field(min_length=1, max_length=500)
    direction: Direction
    # Cf. DriverCreate.id.
    id: uuid.UUID | None = None


class PassengerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    address: str
    lat: float
    lon: float
    direction: Direction


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
    # Absent si aucune matrice de durées n'a pu être obtenue (repli Haversine).
    cumulative_duration_s: int | None = None


class RouteOut(BaseModel):
    driver_id: uuid.UUID
    driver_name: str
    distance_m: int
    duration_s: int | None = None
    stops: list[StopOut]
    # Tracé routier réel (suite de points [lat, lon]) pour l'affichage sur la
    # carte. Absent si OSRM n'est pas disponible — le client relie alors les
    # arrêts en ligne droite. Optionnel aussi pour rester compatible avec les
    # solutions déjà stockées en base avant l'ajout de ce champ.
    geometry: list[list[float]] | None = None


class MoveStopIn(BaseModel):
    """Déplace un passager vers une tournée (la sienne ou une autre) après
    un calcul — cf. `move_stop` dans routes.py. `driver_id` peut être le
    conducteur déjà actuel du passager : dans ce cas, retirer puis
    réinsérer via l'insertion la moins chère revient à recalculer sa
    meilleure position parmi les arrêts déjà présents."""

    passenger_id: uuid.UUID
    driver_id: uuid.UUID


class SolutionOut(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    direction: Direction
    total_distance_m: int
    total_duration_s: int | None = None
    matrix_source: str
    fallback_reason: str | None
    routes: list[RouteOut]
    created_at: datetime
