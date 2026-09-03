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

    # Secret de signature des jetons de session (JWT). Contrairement aux
    # autres variables ci-dessus, PAS de valeur par défaut : un secret de
    # signature avec un défaut connu de tous serait une faille, pas une
    # dégradation gracieuse. Son absence fait échouer le démarrage
    # (pydantic-settings lève dès l'instanciation), plutôt qu'une appli qui
    # tourne en signant des jetons avec une valeur devinable.
    jwt_secret: str

    # Vide = connexion Google désactivée (le bouton peut rester affiché côté
    # frontend, mais /auth/google renverra une erreur claire) — dégradation
    # cohérente avec le reste de ce fichier. C'est l'identifiant client
    # Google (public, pas un secret) : sert uniquement à vérifier que le
    # jeton d'identité présenté a bien été émis pour cette appli.
    google_oauth_client_id: str = ""

    # Identifie quelle instance répond (ex. "truenas"/"railway") dans
    # /health et le journal d'événements — sans ça, impossible de savoir
    # laquelle des deux sert le trafic pendant une bascule de failover.
    instance_name: str = "inconnue"

    # /solve construit une matrice de distances en O(n²) éléments, facturée
    # à l'élément côté Google Routes : ce plafond est autant un garde-fou de
    # coût que de charge. 40 participants -> 1681 éléments par calcul.
    max_participants_per_event: int = 40

    # Anti-rafale sur /solve : chaque calcul relance la matrice complète
    # (payante) et OR-Tools. Un cooldown court suffit à absorber un double
    # clic sans gêner un usage normal.
    solve_cooldown_s: int = 20

    # Borne le nombre de threads CPU-bound simultanés (OR-Tools tourne hors
    # de la boucle d'événements via anyio.to_thread) — limite par process,
    # même logique assumée que le rate-limiter Nominatim (1 req/s "par
    # process", cf. app/geocoding/nominatim.py).
    max_concurrent_solves: int = 2

    # Un déplacement par glisser-déposer (move-stop) insère une nouvelle
    # SolutionRecord à chaque geste : sans purge, l'historique d'un
    # événement très manipulé croît sans borne.
    max_solutions_kept_per_direction: int = 20

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
