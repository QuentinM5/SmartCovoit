# Le solveur — modèle et hypothèses

## Modélisation VRP

Un événement devient un problème de VRP capacitaire (`ortools.constraint_solver`) :

- **Nœuds** : `0` = dépôt (le point commun de l'événement), `1..D` =
  domicile de chaque conducteur, `D+1..D+P` = adresse de chaque passager.
- **Véhicules** : exactement `D` (un par conducteur inscrit). Ce n'est pas
  une variable d'optimisation — un conducteur inscrit se rend de toute façon
  à l'événement, avec ou sans passager. Un véhicule sans passager affecté
  produit simplement un trajet direct entre ses deux extrémités.
- **Capacité** : la dimension `Capacity` d'OR-Tools, demande de `1` par
  passager, capacité par véhicule = places déclarées par son conducteur.
- **Objectif** : minimiser la durée totale de trajet de l'ensemble de la
  flotte (`SetArcCostEvaluatorOfAllVehicles`) quand une matrice de durées est
  disponible (`duration_matrix` dans `SolveRequest`), sinon la distance
  totale — cf. `backend/app/solver/vrp.py`, `cost_matrix = duration_matrix if
  duration_matrix is not None else matrix`. La matrice de durées vient de
  OSRM, Mapbox ou Google selon la chaîne de repli (`google (sommeil) → osrm →
  mapbox → haversine` — Haversine seul n'en fournit pas, une ligne droite
  n'a pas de durée de circulation). La distance, elle, reste toujours
  renseignée quelle que soit la source et sert de vérité affichée en km
  (cf. `MatrixResult` dans `backend/app/distance/types.py`) — mais ce n'est
  plus elle que le solveur minimise dès qu'une matrice de durées existe.

## `direction`

| | `ramassage` | `dispersion` |
|---|---|---|
| Départ (`starts`) | domicile du conducteur | dépôt |
| Arrivée (`ends`) | dépôt | domicile du conducteur |

Techniquement, `RoutingIndexManager(n, V, starts, ends)` reçoit des listes
différentes selon le sens. Effet de bord utile : un nœud utilisé comme
start/end pour un seul véhicule n'est jamais disponible comme arrêt
intermédiaire pour un autre — le domicile du conducteur A n'est donc jamais
traversé par le conducteur B.

## Erreurs

- `InfeasibleError` — vérification arithmétique (`sum(seats) < len(passengers)`)
  *avant* d'appeler OR-Tools, pour un message chiffré immédiat plutôt qu'un
  échec silencieux du solveur.
- `NoSolutionError` — cas résiduel où OR-Tools ne trouve rien malgré une
  capacité suffisante (ex. limite de temps trop courte sur une instance très
  contrainte). Ajustable via `SOLVER_TIME_LIMIT_S`.

## Étendre plus tard (hors scope V1, code structuré pour)

- **Fenêtres de temps (VRPTW)** : ajouter une dimension `Time` (comme
  `Capacity`), avec `AddDimension` et des bornes horaires par nœud. La
  matrice de durées existe déjà (cf. `Objectif` ci-dessus, c'est elle que le
  solveur minimise) — il n'y a donc pas de seconde matrice à introduire pour
  ça, seulement la dimension `Time` et les contraintes horaires elles-mêmes.
- **Regroupements** : contraintes de type `AddDisjunction` ou des
  contraintes de précédence pour garder des sous-groupes ensemble.
- **Exclusion de conducteurs en trop** : actuellement tous les conducteurs
  inscrits sont utilisés. Pour rendre ça optionnel, associer un coût fixe
  d'activation par véhicule (`SetFixedCostOfVehicle`) plutôt que de changer
  la structure du problème.

Le fichier `backend/scripts/demo_solver.py` permet de rejouer un scénario
avec des adresses parisiennes réelles et d'inspecter les tournées produites
sans passer par l'API.
