"""Tests de normalisation de DATABASE_URL — le piège asyncpg/sslmode."""

from __future__ import annotations

import pytest

from app.db.url import normalize_database_url


def test_neon_url_forces_asyncpg_and_extracts_ssl():
    raw = "postgresql://neondb_owner:secret@ep-purple-mud.aws.neon.tech/neondb?sslmode=require"
    conn = normalize_database_url(raw)

    assert conn.url.startswith("postgresql+asyncpg://")
    assert "sslmode" not in conn.url
    assert conn.connect_args == {"ssl": True}


def test_channel_binding_is_stripped():
    raw = "postgresql://u:p@host/db?sslmode=require&channel_binding=require"
    conn = normalize_database_url(raw)

    assert "channel_binding" not in conn.url
    assert "sslmode" not in conn.url


def test_local_compose_url_without_sslmode_has_no_ssl_connect_arg():
    raw = "postgresql://smartcovoit:smartcovoit@db:5432/smartcovoit"
    conn = normalize_database_url(raw)

    assert conn.url == "postgresql+asyncpg://smartcovoit:smartcovoit@db:5432/smartcovoit"
    assert conn.connect_args == {}


def test_sslmode_disable_does_not_set_ssl():
    raw = "postgresql://u:p@host/db?sslmode=disable"
    conn = normalize_database_url(raw)

    assert conn.connect_args == {}


def test_heroku_style_postgres_scheme_is_rewritten():
    raw = "postgres://u:p@host/db"
    conn = normalize_database_url(raw)

    assert conn.url.startswith("postgresql+asyncpg://")


def test_unsupported_scheme_raises():
    with pytest.raises(ValueError, match="non supporté"):
        normalize_database_url("mysql://u:p@host/db")


def test_other_query_params_are_preserved():
    raw = "postgresql://u:p@host/db?sslmode=require&application_name=smartcovoit"
    conn = normalize_database_url(raw)

    assert "application_name=smartcovoit" in conn.url
