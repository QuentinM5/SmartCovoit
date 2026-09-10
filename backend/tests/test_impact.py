"""Tests de `app.impact` — fonction pure, isolée de la base de données,
même philosophie que test_limits.py."""

from __future__ import annotations

from app.impact import CO2_FACTOR_KG_PER_KM, co2_saved_kg


def test_co2_saved_kg_zero_for_no_distances() -> None:
    assert co2_saved_kg([]) == 0.0


def test_co2_saved_kg_doubles_for_round_trip() -> None:
    # 1000 m à l'aller -> 2000 m aller-retour -> 2 km * facteur.
    assert co2_saved_kg([1000]) == round(2 * CO2_FACTOR_KG_PER_KM, 1)


def test_co2_saved_kg_sums_multiple_passengers() -> None:
    assert co2_saved_kg([1000, 2000]) == round((2000 + 4000) / 1000 * CO2_FACTOR_KG_PER_KM, 1)


def test_co2_saved_kg_rounds_to_one_decimal() -> None:
    result = co2_saved_kg([1234])
    assert result == round(result, 1)
