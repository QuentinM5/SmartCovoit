# SmartCovoit

Solveur de covoiturage optimisé pour événements de groupe (20–40 personnes).
Les conducteurs s'inscrivent avec leurs places disponibles et leur adresse,
les passagers avec leur adresse ; le backend calcule l'affectation optimale
(VRP capacitaire, OR-Tools) et produit une feuille de route par conducteur.

En production : **https://smartcovoit.qmeyer.fr** — cf. `docs/deploiement.md`
pour l'architecture (TrueNAS + secours cloud + Worker de failover) et les
étapes de déploiement restantes.

## Structure du repo

```
/backend    FastAPI + OR-Tools + SQLAlchemy async — l'API et le solveur
/frontend   Next.js — formulaires d'inscription et affichage des tournées
/worker     Worker Cloudflare — répartiteur de failover (squelette, non déployé)
/infra      docker-compose.yml, Dockerfile.backend
/docs       ce dossier
```

## Lancer en local

```bash
docker compose -f infra/docker-compose.yml up
```

Démarre le backend (port 8000) et un Postgres jetable. Swagger accessible
sur `http://localhost:8000/docs`. La migration Alembic s'applique
automatiquement au démarrage du conteneur backend.

Pour le frontend :

```bash
cd frontend
npm install
npm run dev
```

Accessible sur `http://localhost:3000`. Nécessite `NEXT_PUBLIC_API_URL`
dans `frontend/.env.local` (cf. `.env.example` à la racine).

Pour activer OSRM (routage réel plutôt que distance à vol d'oiseau) :
voir `docs/osrm.md`.

## Variables d'environnement

Voir `.env.example` à la racine du repo — copie-le en `.env` et complète.
Toutes les valeurs sensibles (dont `DATABASE_URL`) passent exclusivement par
des variables d'environnement, jamais en dur dans le code.

| Variable | Description | Défaut |
|---|---|---|
| `DATABASE_URL` | Connexion Postgres (Neon en prod, format libpq accepté — `sslmode=require` géré automatiquement) | Postgres local du docker-compose |
| `OSRM_URL` | URL du service OSRM `table` endpoint. Vide = repli Haversine direct, sans avertissement | (vide) |
| `GOOGLE_ROUTES_API_KEY` | Clé serveur Google Routes API (trafic temps réel). Vide = repli OSRM direct, sans avertissement. Distincte de `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (navigateur) | (vide) |
| `NOMINATIM_URL` | Instance Nominatim à interroger | instance publique OpenStreetMap |
| `NOMINATIM_USER_AGENT` | Identifiant requis par la politique d'usage Nominatim | — |
| `SOLVER_TIME_LIMIT_S` | Limite de temps (s) laissée à OR-Tools | `10` |
| `CORS_ORIGINS` | Origines autorisées, séparées par des virgules | `http://localhost:3000` |
| `INSTANCE_NAME` | Nom de l'instance (ex. `truenas`/`railway`), pour `/health` et le journal d'événements | `inconnue` |
| `MAX_PARTICIPANTS_PER_EVENT` | Plafond d'inscrits par événement (garde-fou de coût sur `/solve`) | `40` |
| `SOLVE_COOLDOWN_S` | Délai minimum entre deux calculs pour le même (événement, sens) | `20` |
| `MAX_CONCURRENT_SOLVES` | Nombre de calculs OR-Tools simultanés, par process | `2` |
| `MAX_SOLUTIONS_KEPT_PER_DIRECTION` | Historique de solutions conservé par (événement, sens) après un move-stop | `20` |
| `NEXT_PUBLIC_API_URL` | Seule URL d'API que le frontend appelle | `http://localhost:8000` |

## Tests

```bash
cd backend
python -m venv .venv && .venv/Scripts/activate  # ou source .venv/bin/activate sur Linux/Mac
pip install -r requirements-dev.txt
pytest tests/ -v
```

27 tests couvrent : le solveur VRP (capacité, ramassage/dispersion,
conducteur unique, passagers > places disponibles), le repli OSRM →
Haversine, le client Nominatim (cache, rate limit), et la normalisation de
`DATABASE_URL` pour asyncpg.

`backend/scripts/demo_solver.py` permet de visualiser des tournées sur un
scénario réaliste (adresses parisiennes) sans passer par l'API :

```bash
python scripts/demo_solver.py
```

## Documentation complémentaire

- `docs/solveur.md` — le modèle VRP en détail, comment l'étendre (fenêtres
  de temps, regroupements).
- `docs/osrm.md` — préparer des données OSRM pour du routage réel.
- `docs/deploiement.md` — étapes manuelles restantes pour le déploiement
  (TrueNAS, instance cloud de secours, Worker Cloudflare, DNS).

## Ce qui est hors scope de cette V1 (assumé, structuré pour être ajouté)

- Créneaux horaires / fenêtres de temps (VRPTW)
- Contraintes de regroupement de sous-groupes
- Authentification — formulaire public, sans compte utilisateur
