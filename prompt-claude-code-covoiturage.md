# Solveur de covoiturage optimisé — Brief pour Claude Code

## Contexte

Application web pour organiser les covoiturages d'événements de groupe (20 à 40 personnes). Les conducteurs s'inscrivent avec leur nombre de places disponibles et leur point de départ, les passagers s'inscrivent avec leur point de départ. Le backend calcule l'affectation optimale (qui prend qui) et génère une feuille de route.

## Objectif de cette session

Construire un projet complet et fonctionnel en local (via `docker-compose up`), prêt à être déployé ensuite. Tu n'as pas besoin de déployer réellement — documente les étapes de déploiement restantes dans le README, je m'en charge manuellement (comptes, secrets, DNS).

## Stack technique imposée

- **Backend** : Python 3.11, FastAPI, SQLAlchemy (async), asyncpg, OR-Tools (`ortools.constraint_solver`)
- **Base de données** : PostgreSQL externe (pas de SQLite — le backend doit pouvoir tourner en plusieurs instances qui partagent le même état)
- **Géocodage** : Nominatim (OpenStreetMap), avec cache des résultats en base pour éviter de re-géocoder une adresse déjà connue, et respect du rate limit d'1 requête/seconde
- **Matrice de distances** : appel à un service OSRM (`table` endpoint) en priorité ; si OSRM ne répond pas ou n'est pas configuré, fallback automatique sur une distance Haversine (à vol d'oiseau) — ce fallback doit être transparent et loggé, pas une erreur
- **Frontend** : Next.js (App Router), TypeScript, Tailwind — reste simple et sobre, pas besoin de composants ni de librairies exotiques
- **Conteneurisation** : Dockerfile pour le backend, `docker-compose.yml` pour le dev local (backend + Postgres + service OSRM optionnel via un flag)

## Modèle métier — c'est le cœur du projet

Un problème de VRP (Vehicle Routing Problem) capacitaire résolu avec OR-Tools (`RoutingIndexManager` / `RoutingModel`) :

- **Paramètre `direction`** par événement, deux valeurs possibles :
  - `ramassage` : tout le monde converge vers un point d'arrivée commun (le dépôt est la destination)
  - `dispersion` : tout le monde part d'un point commun (le dépôt est l'origine)
- **Nombre de véhicules** : fixe, égal au nombre exact de conducteurs inscrits pour l'événement. Ce n'est **pas** une variable à minimiser — même si plus de conducteurs se sont proposés que nécessaire, ils sont tous utilisés (ou alors laisse un flag explicite pour exclure les conducteurs en trop, mais ce n'est pas le comportement par défaut).
- **Capacité** de chaque véhicule = places déclarées par son conducteur
- **Objectif unique** : minimiser la distance totale parcourue par l'ensemble de la flotte
- **Sortie attendue** : pour chaque véhicule, la liste ordonnée des passagers à récupérer/déposer (l'ordre de passage compte, c'est la feuille de route)

## Explicitement hors scope pour cette V1

Ne pas implémenter maintenant, mais structurer le code pour que ce soit ajoutable sans réécriture :
- Créneaux horaires / fenêtres de temps (VRPTW)
- Contraintes de regroupement (ex. garder certains sous-groupes ensemble)
- Authentification / comptes utilisateurs — c'est un formulaire public simple, sans login

## Architecture de déploiement à anticiper (ne pas déployer, juste documenter et structurer)

- Une instance backend + OSRM tournera en Docker Compose sur un serveur TrueNAS local, exposée via Cloudflare Tunnel — le code ne doit faire aucune hypothèse sur l'IP ou le hostname (tout doit passer par des variables d'environnement)
- Une seconde instance backend (identique, sans OSRM, fallback Haversine automatique) tournera sur un hébergeur cloud (Fly.io ou Railway) comme secours
- Les deux instances backend partagent la même base Postgres externe (Neon)
- Un Worker Cloudflare fera office de proxy de failover devant les deux instances (à écrire dans un dossier séparé `worker/`, projet Wrangler à part) — pas besoin de l'implémenter en détail maintenant, juste prévoir la séparation des dossiers
- Le frontend n'appelle jamais directement un backend : il appelle une seule URL d'API configurable via variable d'environnement (`NEXT_PUBLIC_API_URL`)

## Structure de repo attendue (monorepo)

```
/backend        # FastAPI + OR-Tools
/frontend        # Next.js
/worker           # Worker Cloudflare (squelette minimal pour l'instant)
/infra            # docker-compose.yml, Dockerfiles
/docs             # README détaillé, notes de déploiement
```

## Endpoints API minimaux

- `POST /events` — créer un événement (avec son paramètre `direction`)
- `POST /events/{id}/drivers` — inscription conducteur (nom, places, adresse)
- `POST /events/{id}/passengers` — inscription passager (nom, adresse)
- `POST /events/{id}/solve` — déclenche le calcul, retourne la feuille de route
- `GET /events/{id}/solution` — récupère la dernière solution calculée
- `GET /health` — health check simple, utile pour le futur Worker de failover

## Exigences de qualité

- Tests unitaires sur la logique du solveur : capacité dépassée, `direction=ramassage` vs `dispersion`, cas à un seul conducteur, cas où passagers > places totales disponibles (doit renvoyer une erreur claire, pas planter)
- Toute valeur sensible (connection string, clés) via variables d'environnement uniquement, jamais en dur dans le code
- Documentation Swagger/OpenAPI automatique de FastAPI activée et accessible
- README avec : instructions de lancement local (`docker-compose up`), variables d'environnement requises, et la liste des étapes de déploiement qui restent à faire manuellement (comptes cloud, secrets, DNS)

## Comment travailler

- Commence par le modèle OR-Tools isolé (avec des données de test en dur) et valide qu'il produit des résultats cohérents avant de brancher l'API dessus
- Décris-moi ton plan avant d'écrire le code sur les parties ambiguës (notamment la gestion du fallback OSRM → Haversine)
- Priorité : un backend qui tourne et un solveur correct, avant de peaufiner le frontend

## Gestion des actions manuelles

Dès que tu identifies une action que je dois faire moi-même (créer un compte, générer une clé API, exécuter une commande d'authentification interactive, cliquer dans un dashboard, etc.), applique cette règle :

- **Si ça te bloque pour avancer** : arrête-toi sur cette tâche précise, dis-moi clairement ce qui te bloque, et donne-moi un mode d'emploi pas à pas pour la faire. Pendant ce temps, continue à travailler sur tout le reste du projet qui ne dépend pas de cette action.
- **Si ça ne te bloque pas** (tu peux continuer avec des valeurs factices, des mocks, ou en repoussant cette partie à plus tard) : signale-le-moi au fil de l'eau avec le même mode d'emploi pas à pas, mais ne t'arrête pas — continue à avancer sur le reste en parallèle.

Le mode d'emploi pas à pas doit être concret : les clics exacts, les commandes exactes à taper, où trouver l'information demandée. Pas de "configure ta base de données" — plutôt "va sur console.neon.tech, crée un projet nommé X, copie le connection string affiché sous 'Connection Details', colle-le dans .env sous DATABASE_URL".
