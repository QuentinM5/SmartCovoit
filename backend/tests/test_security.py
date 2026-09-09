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

from fastapi import HTTPException

from app.api.deps import get_admin_user
from app.api.routes import _can_remove_participant, _check_owner_or_open, _driver_out, _email_fingerprint, _passenger_out
from app.core.config import Settings
from app.core.security import (
    GoogleIdentity,
    hash_password,
    issue_session_token,
    verify_google_id_token,
    verify_password,
    verify_session_token,
)
from app.db.models import Driver, Event, Passenger, User

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
    with pytest.raises(HTTPException) as exc_info:
        _check_owner_or_open(_event(owner_id=uuid.uuid4()), _user())
    assert exc_info.value.status_code == 403


def test_can_remove_participant_own_row() -> None:
    user = _user()
    assert _can_remove_participant(_event(owner_id=uuid.uuid4()), user.id, user)


def test_can_remove_participant_orphan_row_owner_can_still_manage() -> None:
    # Une inscription faite hors API (sans user_id connu, ex. import direct
    # en base) reste gérable par l'organisateur de l'événement.
    owner = _user()
    assert _can_remove_participant(_event(owner_id=owner.id), None, owner)


def test_can_remove_participant_orphan_row_rejects_stranger() -> None:
    # Contrairement à avant (cf. M8 de l'audit sécurité), une inscription
    # orpheline (user_id nul) n'est plus modifiable par n'importe quel compte
    # connecté — seul l'organisateur peut encore la gérer (test ci-dessus).
    event = _event(owner_id=uuid.uuid4())
    assert not _can_remove_participant(event, None, _user())


def test_can_remove_participant_event_owner_can_remove_anyone() -> None:
    user = _user()
    assert _can_remove_participant(_event(owner_id=user.id), uuid.uuid4(), user)


def test_can_remove_participant_rejects_stranger() -> None:
    event = _event(owner_id=uuid.uuid4())
    assert not _can_remove_participant(event, uuid.uuid4(), _user())


def _driver(user_id: uuid.UUID | None) -> Driver:
    return Driver(
        id=uuid.uuid4(), event_id=uuid.uuid4(), direction="ramassage", name="D", seats=4,
        address="", lat=0, lon=0, user_id=user_id,
    )


def _passenger(user_id: uuid.UUID | None) -> Passenger:
    return Passenger(
        id=uuid.uuid4(), event_id=uuid.uuid4(), direction="ramassage", name="P",
        address="", lat=0, lon=0, user_id=user_id,
    )


def test_driver_out_hides_user_id_and_exposes_can_edit() -> None:
    # M7 de l'audit sécurité : DriverOut ne doit plus jamais transporter
    # user_id, un visiteur anonyme (current_user=None) reçoit can_edit=False.
    driver = _driver(user_id=uuid.uuid4())
    out = _driver_out(driver, _event(owner_id=uuid.uuid4()), current_user=None)
    assert not hasattr(out, "user_id")
    assert out.can_edit is False


def test_driver_out_can_edit_true_for_owner() -> None:
    owner = _user()
    driver = _driver(user_id=uuid.uuid4())
    out = _driver_out(driver, _event(owner_id=owner.id), current_user=owner)
    assert out.can_edit is True


def test_passenger_out_can_edit_true_for_self() -> None:
    passenger_user = _user()
    passenger = _passenger(user_id=passenger_user.id)
    out = _passenger_out(passenger, _event(owner_id=uuid.uuid4()), current_user=passenger_user)
    assert out.can_edit is True


def test_passenger_out_can_edit_false_for_stranger() -> None:
    passenger = _passenger(user_id=uuid.uuid4())
    out = _passenger_out(passenger, _event(owner_id=uuid.uuid4()), current_user=_user())
    assert out.can_edit is False


def test_email_fingerprint_stable_and_case_insensitive() -> None:
    assert _email_fingerprint("Alice@Example.com", "s") == _email_fingerprint("alice@example.com ", "s")


def test_email_fingerprint_differs_per_secret() -> None:
    # Ne dépend pas d'un secret dédié : elle doit quand même varier avec le
    # secret pour ne pas être devinable hors contexte de l'application.
    assert _email_fingerprint("alice@example.com", "s1") != _email_fingerprint("alice@example.com", "s2")


def test_email_fingerprint_differs_per_email() -> None:
    assert _email_fingerprint("alice@example.com", "s") != _email_fingerprint("bob@example.com", "s")


def _settings(admin_emails: str = "") -> Settings:
    return Settings(jwt_secret="test-secret", admin_emails=admin_emails)


async def test_get_admin_user_allows_listed_email() -> None:
    user = User(id=uuid.uuid4(), email="Admin@Example.com", name="A")
    settings = _settings(admin_emails="admin@example.com")
    # Comparaison insensible à la casse des deux côtés : un email saisi
    # différemment dans ADMIN_EMAILS ne doit pas silencieusement exclure
    # le bon compte.
    assert await get_admin_user(current_user=user, settings=settings) is user


async def test_get_admin_user_rejects_unlisted_email() -> None:
    settings = _settings(admin_emails="someoneelse@example.com")
    with pytest.raises(HTTPException) as exc_info:
        await get_admin_user(current_user=_user(), settings=settings)
    assert exc_info.value.status_code == 403


async def test_get_admin_user_rejects_when_list_empty() -> None:
    # admin_emails vide = personne n'entre jamais, pas de compte admin
    # implicite (cf. commentaire sur ce réglage dans config.py).
    settings = _settings(admin_emails="")
    with pytest.raises(HTTPException):
        await get_admin_user(current_user=_user(), settings=settings)
