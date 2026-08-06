"""Types du géocodage — indépendants de SQLAlchemy pour rester testables sans base.

`GeocodeCache` est un protocole ; l'implémentation concrète (table Postgres
`geocode_cache`) arrive avec la couche persistance (app/db). Un cache en
mémoire suffit pour tester `NominatimClient` isolément.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class GeocodeResult:
    lat: float
    lon: float
    display_name: str


class GeocodeCache(Protocol):
    async def get(self, address_norm: str) -> GeocodeResult | None: ...

    async def set(self, address_norm: str, result: GeocodeResult) -> None: ...


class GeocodingError(Exception):
    """Adresse introuvable ou Nominatim indisponible — remonté en 422 par l'API."""


def normalize_address(address: str) -> str:
    """Normalisation simple pour la clé de cache : espaces et casse.

    Volontairement peu agressive — deux adresses formulées différemment mais
    équivalentes ne partageront pas forcément une entrée, ce qui n'est pas
    grave (juste un appel Nominatim de plus), alors qu'une normalisation trop
    agressive risquerait de fusionner deux adresses distinctes.
    """
    return " ".join(address.strip().lower().split())
