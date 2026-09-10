"""Estimation de l'impact CO2 du covoiturage — cf. plan (chantier D).

Ce n'est PAS une simulation de ce qui se serait passé sans covoiturage
(personne ne sait qui aurait pris sa voiture, ou pas, dans un monde sans
covoiturage) : c'est « la distance que chaque passager n'a pas conduite
lui-même », à vol d'oiseau, aller-retour, convertie via un facteur
d'émission moyen publié. Présenté comme une estimation dans l'interface
(cf. frontend), jamais comme une mesure exacte — un chiffre honnête plutôt
qu'un chiffre inventé.

Fonction pure, testable sans base de données (cf. tests/test_impact.py),
même esprit que le reste du repo (app.solver, _participant_cap_reached...).
"""

from __future__ import annotations

# ADEME (Base Empreinte, moyenne parc automobile français essence+diesel),
# arrondie : ~193 g de CO2 par kilomètre parcouru pour une voiture
# particulière. Une constante plutôt qu'un réglage par événement : la
# méthodologie doit rester la même pour tout le monde, sinon le chiffre
# affiché n'est plus comparable ni honnête d'un événement à l'autre.
CO2_FACTOR_KG_PER_KM = 0.193


def co2_saved_kg(one_way_distances_m: list[int]) -> float:
    """Kg de CO2 « économisés » : somme des trajets aller-retour (à vol
    d'oiseau) que chaque passager n'a pas faits dans sa propre voiture,
    convertie via `CO2_FACTOR_KG_PER_KM`. Arrondi à une décimale — plus de
    précision affichée suggérerait une exactitude que la méthode n'a pas."""
    round_trip_km = sum(one_way_distances_m) * 2 / 1000
    return round(round_trip_km * CO2_FACTOR_KG_PER_KM, 1)
