"""Sécurité des comptes — hachage de mot de passe, jetons de session (JWT),
vérification des jetons d'identité Google.

Fonctions pures (pas de dépendance à la base ni à FastAPI) : testables sans
fixture, dans le même esprit que le reste du backend (cf. `app/solver` et
`backend/tests/test_move_stop.py`). Le secret de signature et l'identifiant
client Google sont passés en paramètre plutôt que lus depuis `Settings`
directement ici, pour ne pas exiger de variables d'environnement pour
tester ces fonctions.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2 import id_token as google_id_token

# Pas de rafraîchissement automatique : se reconnecter après 30 jours
# d'inactivité est un compromis raisonnable pour un projet de cette taille
# (cf. plan), plus simple qu'un système de jeton de rafraîchissement séparé.
SESSION_TOKEN_TTL = timedelta(days=30)
JWT_ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def issue_session_token(user_id: uuid.UUID, secret: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user_id), "iat": now, "exp": now + SESSION_TOKEN_TTL}
    return jwt.encode(payload, secret, algorithm=JWT_ALGORITHM)


def verify_session_token(token: str, secret: str) -> uuid.UUID:
    """Lève `jwt.InvalidTokenError` (dont `ExpiredSignatureError`) si le
    jeton est invalide ou expiré — à l'appelant (la dépendance FastAPI) de
    traduire ça en 401."""
    payload = jwt.decode(token, secret, algorithms=[JWT_ALGORITHM])
    return uuid.UUID(payload["sub"])


class GoogleIdentity:
    """Identité extraite d'un jeton d'identité Google déjà vérifié."""

    def __init__(self, sub: str, email: str, name: str) -> None:
        self.sub = sub
        self.email = email
        self.name = name


def verify_google_id_token(id_token_str: str, client_id: str) -> GoogleIdentity:
    """Vérifie la signature et l'audience d'un jeton d'identité Google
    (obtenu côté client via Google Identity Services, pas le flux OAuth
    complet — cf. plan) contre les clés publiques de Google. Lève une
    exception (ValueError ou une sous-classe de GoogleAuthError selon la
    cause) si invalide, expiré, ou émis pour un autre client — à
    l'appelant de traduire en 401.
    """
    claims = google_id_token.verify_oauth2_token(id_token_str, GoogleAuthRequest(), client_id)
    return GoogleIdentity(sub=claims["sub"], email=claims["email"], name=claims.get("name", claims["email"]))
