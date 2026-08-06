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
- **Objectif** : un seul critère, minimiser la distance totale parcourue par
  l'ensemble de la flotte (`SetArcCostEvaluatorOfAllVehicles`).

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
  `Capacity`), avec `AddDimension` et des bornes horaires par nœud. Le
  modèle actuel n'a pas de notion de temps de trajet, seulement de distance
  — il faudrait une seconde matrice (durées) en plus de celle des distances.
- **Regroupements** : contraintes de type `AddDisjunction` ou des
  contraintes de précédence pour garder des sous-groupes ensemble.
- **Exclusion de conducteurs en trop** : actuellement tous les conducteurs
  inscrits sont utilisés. Pour rendre ça optionnel, associer un coût fixe
  d'activation par véhicule (`SetFixedCostOfVehicle`) plutôt que de changer
  la structure du problème.

Le fichier `backend/scripts/demo_solver.py` permet de rejouer un scénario
avec des adresses parisiennes réelles et d'inspecter les tournées produites
sans passer par l'API.
