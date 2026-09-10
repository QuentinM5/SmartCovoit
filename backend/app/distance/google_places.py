"""Client Google Places (New) — recherche à proximité, pour suggérer un vrai
point de rassemblement (station, parking) plutôt qu'un point géométrique
sans nom. Cf. app/meetup_suggestions.py pour l'usage.

Distinct de `GOOGLE_ROUTES_API_KEY` (google_routes.py) — une variable dédiée
(`GOOGLE_PLACES_API_KEY`), vide par défaut comme le reste des intégrations
Google de cette app : l'absence de clé désactive la fonctionnalité sans
erreur, elle ne la remplace jamais par une dégradation silencieuse coûteuse.

⚠️ Cette API est facturée à l'appel (cf. audit facturation) : n'est censée
être appelée qu'à la demande explicite d'un clic organisateur (jamais à
chaque `/solve`), et un plafond de quota doit être posé côté console Google
Cloud avant toute activation en production — cf. docs/deploiement.md.
"""

from __future__ import annotations

import httpx

from app.distance.types import Coord

_ENDPOINT = "https://places.googleapis.com/v1/places:searchNearby"
_FIELD_MASK = "places.displayName,places.formattedAddress,places.location"

# Des lieux publics, faciles à trouver et à se garer à proximité — pas
# n'importe quel commerce. Ordre sans importance : la New Nearby Search ne
# priorise pas par position dans cette liste, seulement par distance.
_INCLUDED_TYPES = ["subway_station", "train_station", "light_rail_station", "parking"]


class GooglePlacesError(Exception):
    """Toute défaillance Places : injoignable, quota, clé invalide."""


class MeetupPoint:
    def __init__(self, name: str, address: str, lat: float, lon: float) -> None:
        self.name = name
        self.address = address
        self.lat = lat
        self.lon = lon


class GooglePlacesClient:
    def __init__(self, api_key: str, timeout_s: float = 10.0) -> None:
        self.api_key = api_key
        self.timeout_s = timeout_s

    async def find_meetup_point(self, center: Coord, radius_m: float = 800.0) -> MeetupPoint | None:
        """Le lieu le plus proche du centre parmi les types visés, ou `None`
        si rien d'exploitable — ce n'est qu'une suggestion, jamais une
        raison de faire échouer l'appelant."""
        body = {
            "includedTypes": _INCLUDED_TYPES,
            "maxResultCount": 1,
            "locationRestriction": {
                "circle": {
                    "center": {"latitude": center.lat, "longitude": center.lon},
                    "radius": radius_m,
                }
            },
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout_s) as client:
                response = await client.post(
                    _ENDPOINT,
                    json=body,
                    headers={"X-Goog-Api-Key": self.api_key, "X-Goog-FieldMask": _FIELD_MASK},
                )
        except httpx.HTTPError as exc:
            raise GooglePlacesError(f"Google Places injoignable : {exc}") from exc

        if response.status_code != 200:
            raise GooglePlacesError(f"Google Places a répondu {response.status_code} : {response.text[:300]}")

        try:
            payload = response.json()
        except ValueError as exc:
            raise GooglePlacesError("Réponse Google Places non JSON") from exc

        places = payload.get("places") or []
        if not places:
            return None

        first = places[0]
        try:
            return MeetupPoint(
                name=first["displayName"]["text"],
                address=first.get("formattedAddress", ""),
                lat=first["location"]["latitude"],
                lon=first["location"]["longitude"],
            )
        except (KeyError, TypeError) as exc:
            raise GooglePlacesError(f"Élément Google Places malformé : {first!r:.200}") from exc
