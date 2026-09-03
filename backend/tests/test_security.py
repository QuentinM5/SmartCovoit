"""Tests de `app.core.security` (mot de passe, JWT de session, vérification
Google) et des helpers d'autorisation de `app.api.routes` — isolés de la
base de données, même philosophie que `test_move_stop.py`.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import jwt
import pytest

from app.api.routes import _can_remove_participant, _check_owner_or_open
from app.core.security import (
    GoogleIdentity,
    hash_password,
    issue_session_token,
    verify_google_id_token,
    verify_password,
    verify_session_token,
)
from app.db.models import Event, User

SECRET = "test-secret"


def test_hash_password_round_trip() -> None:
    hashed = hash_password("correcthorsebatterystaple")
    assert verify_password("correcthorsebatterystaple", hashed)


def test_hash_password_rejects_wrong_password() -> None:
    hashed = hash_password("correcthorsebatterystaple")
    assert not verify_password("wrong password", hashed)


def test_hash_password_produces_different_hashes_for_same_password() -> None:
    # Sel aléatoire à chaque appel (bcrypt.gensalt()) — deux hachages du même
    # mot de passe ne doivent jamais être identiques (sinon deux comptes
    # avec le même mot de passe seraient repérables en base).
    assert hash_password("same-password") != hash_password("same-password")


def test_session_token_round_trip() -> None:
    user_id = uuid.uuid4()
    token = issue_session_token(user_id, SECRET)
    assert verify_session_token(token, SECRET) == user_id


def test_session_token_rejects_wrong_secret() -> None:
    token = issue_session_token(uuid.uuid4(), SECRET)
    with pytest.raises(jwt.InvalidTokenError):
        verify_session_token(token, "un autre secret")


def test_session_token_rejects_expired_token() -> None:
    # Construit un jeton déjà expiré directement (plutôt que d'attendre 30
    # jours) : mêmes claims qu'issue_session_token, mais `exp` dans le passé.
    now = datetime.now(timezone.utc)
    payload = {"sub": str(uuid.uuid4()), "iat": now - timedelta(days=31), "exp": now - timedelta(days=1)}
    expired_token = jwt.encode(payload, SECRET, algorithm="HS256")
    with pytest.raises(jwt.ExpiredSignatureError):
        verify_session_token(expired_token, SECRET)


def test_session_token_rejects_malformed_token() -> None:
    with pytest.raises(jwt.InvalidTokenError):
        verify_session_token("ceci-n'est-pas-un-jeton", SECRET)


def test_verify_google_id_token_extracts_identity() -> None:
    # google.oauth2.id_token.verify_oauth2_token fait un vrai appel réseau
    # (récupère les clés publiques de Google) — on ne teste pas cette
    # bibliothèque externe elle-même, seulement que notre enveloppe propage
    # bien le client_id attendu et extrait correctement les champs voulus.
    fake_claims = {"sub": "1234567890", "email": "alice@example.com", "name": "Alice"}
    with patch("app.core.security.google_id_token.verify_oauth2_token", return_value=fake_claims) as mocked:
        identity = verify_google_id_token("un-jeton-google", "mon-client-id")

    mocked.assert_called_once()
    assert mocked.call_args.args[2] == "mon-client-id"
    assert isinstance(identity, GoogleIdentity)
    assert identity.sub == "1234567890"
    assert identity.email == "alice@example.com"
    assert identity.name == "Alice"


def test_verify_google_id_token_defaults_name_to_email() -> None:
    fake_claims = {"sub": "1234567890", "email": "alice@example.com"}
    with patch("app.core.security.google_id_token.verify_oauth2_token", return_value=fake_claims):
        identity = verify_google_id_token("un-jeton-google", "mon-client-id")
    assert identity.name == "alice@example.com"


def _user() -> User:
    return User(id=uuid.uuid4(), email="a@example.com", name="A")


def _event(owner_id: uuid.UUID | None) -> Event:
    return Event(id=uuid.uuid4(), name="Test", depot_address="", depot_lat=0, depot_lon=0, owner_id=owner_id)


def test_check_owner_or_open_allows_owner() -> None:
    user = _user()
    _check_owner_or_open(_event(owner_id=user.id), user)  # ne lève pas


def test_check_owner_or_open_allows_ownerless_event() -> None:
    _check_owner_or_open(_event(owner_id=None), _user())  # ne lève pas


def test_check_owner_or_open_rejects_other_user() -> None:
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        _check_owner_or_open(_event(owner_id=uuid.uuid4()), _user())
    assert exc_info.value.status_code == 403


def test_can_remove_participant_own_row() -> None:
    user = _user()
    assert _can_remove_participant(_event(owner_id=uuid.uuid4()), user.id, user)


def test_can_remove_participant_ownerless_row() -> None:
    assert _can_remove_participant(_event(owner_id=uuid.uuid4()), None, _user())


def test_can_remove_participant_ownerless_event() -> None:
    assert _can_remove_participant(_event(owner_id=None), uuid.uuid4(), _user())


def test_can_remove_participant_event_owner_can_remove_anyone() -> None:
    user = _user()
    assert _can_remove_participant(_event(owner_id=user.id), uuid.uuid4(), user)


def test_can_remove_participant_rejects_stranger() -> None:
    event = _event(owner_id=uuid.uuid4())
    assert not _can_remove_participant(event, uuid.uuid4(), _user())
