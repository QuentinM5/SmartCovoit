"""Normalisation de DATABASE_URL pour asyncpg.

Piège concret rencontré avec Neon : l'URL fournie dans leur dashboard est au
format libpq — `postgresql://user:pass@host/db?sslmode=require`. asyncpg ne
comprend pas `sslmode` (ni `channel_binding`, que Neon ajoute aussi parfois) :
il les rejette comme kwargs de connexion inconnus. Cette fonction retire ces
paramètres de l'URL et retranscrit l'intention TLS en `connect_args={"ssl": True}`,
consommé séparément par `create_async_engine`.
"""

from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

_ASYNCPG_SCHEME = "postgresql+asyncpg"
_SSL_REQUIRED_MODES = {"require", "verify-ca", "verify-full"}
_IGNORED_QUERY_KEYS = {"sslmode", "channel_binding"}


@dataclass(frozen=True)
class DatabaseConnection:
    url: str
    connect_args: dict[str, object]


def normalize_database_url(raw_url: str) -> DatabaseConnection:
    parts = urlsplit(raw_url)

    if parts.scheme in ("postgres", "postgresql", "postgresql+asyncpg"):
        scheme = _ASYNCPG_SCHEME
    else:
        raise ValueError(f"Schéma non supporté pour DATABASE_URL : {parts.scheme!r}")

    query_pairs = parse_qsl(parts.query, keep_blank_values=True)
    sslmode: str | None = None
    kept_pairs: list[tuple[str, str]] = []
    for key, value in query_pairs:
        if key == "sslmode":
            sslmode = value
        elif key in _IGNORED_QUERY_KEYS:
            continue
        else:
            kept_pairs.append((key, value))

    clean_url = urlunsplit(parts._replace(scheme=scheme, query=urlencode(kept_pairs)))

    connect_args: dict[str, object] = {}
    if sslmode in _SSL_REQUIRED_MODES:
        connect_args["ssl"] = True
    # sslmode absent, 'disable' ou 'allow' -> pas de connect_args : comportement
    # par défaut d'asyncpg (pas de TLS), adapté au Postgres local de docker-compose.

    return DatabaseConnection(url=clean_url, connect_args=connect_args)
