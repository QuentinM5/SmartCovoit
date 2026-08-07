"""Configuration — tout ce qui est sensible ou dépendant de l'environnement
passe par des variables d'environnement, jamais en dur (cf. brief).

Aucune hypothèse d'IP ou de hostname n'est faite ici : `osrm_url`,
`nominatim_url`, `database_url` sont toutes injectées de l'extérieur.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Doit être un DATABASE_URL Postgres (postgres:// ou postgresql://,
    # avec ou sans sslmode=require — cf. app/db/url.normalize_database_url).
    database_url: str = "postgresql://smartcovoit:smartcovoit@db:5432/smartcovoit"

    # Vide = pas d'OSRM configuré -> repli Haversine direct, sans warning.
    osrm_url: str = ""

    # Vide = pas de trafic temps réel -> repli sur OSRM direct, sans warning.
    # Distincte de la clé du navigateur (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
    # restreinte par domaine) : celle-ci tourne côté serveur uniquement, ne
    # doit jamais être exposée au client, et n'a besoin d'être restreinte que
    # par API (Routes API) côté console Google Cloud.
    google_routes_api_key: str = ""

    nominatim_url: str = "https://nominatim.openstreetmap.org"
    nominatim_user_agent: str = "smartcovoit/1.0 (set NOMINATIM_USER_AGENT with contact info)"

    solver_time_limit_s: int = 10
    haversine_road_factor: float = 1.0

    # Liste séparée par des virgules, ex. "http://localhost:3000,https://covoit.example.com"
    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
