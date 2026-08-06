# Déploiement — état actuel et ce qu'il reste à faire

Architecture visée : TrueNAS (primaire) + instance cloud (secours) + Worker
Cloudflare (répartiteur) + Neon (base partagée).

## 1. Neon (fait ✅)

`DATABASE_URL` est dans `.env`. Les deux instances backend (TrueNAS et
cloud) pointent vers la même base — c'est ce qui permet au secours cloud de
reprendre le service avec les données à jour si le TrueNAS tombe. La
migration Alembic (`alembic upgrade head`) tourne automatiquement à chaque
démarrage du conteneur backend (cf. commande dans `infra/docker-compose.yml`).

## 2. Instance TrueNAS (primaire) — fait ✅

Backend + Postgres local (non utilisé, `DATABASE_URL` pointe sur Neon) + OSRM
tournent dans `/mnt/Main/apps/smartcovoit/` sur le TrueNAS
(`docker compose -f infra/docker-compose.yml --profile osrm up -d`).

OSRM sert un extrait du **Québec** (carte pré-traitée : `osrm-extract` /
`osrm-partition` / `osrm-customize` faits sur une machine tierce pour ne pas
saturer la RAM du NAS — cf. `docs/osrm.md` — puis les fichiers `.osrm*`
copiés dans `osrm-data/` sur le NAS). `matrix_source: "osrm"` confirmé en
production, pas de repli Haversine.

Exposé publiquement via le tunnel Cloudflare existant du NAS (`TrueNAS`,
`8e51268c-dc7d-49bb-a732-0d83adce18d4`), même mécanisme que les autres
services du NAS (route publiée dans la config du tunnel + CNAME DNS vers
`<tunnel-id>.cfargotunnel.com`, pas d'application Access dessus) :

**`https://smartcovoitlocalapi.qmeyer.fr`** — `/health` et `/docs` répondent, testé
de bout en bout (création d'événement, conducteur, passager, solve avec
distances OSRM réelles) depuis l'extérieur du réseau local.

Aucune IP ni hostname n'est en dur dans le code — tout passe par les
variables d'environnement.

## 3. Instance cloud de secours (Railway) — fait ✅

Déployée depuis le même repo, `infra/Dockerfile.backend` comme Dockerfile via
`railway.json` à la racine (`build.dockerfilePath`, contexte = racine du repo
— nécessaire puisque le Dockerfile fait `COPY backend/...`). Variables
d'environnement renseignées dans l'onglet `Variables` du service (mêmes clés
que `.env.example`), `OSRM_URL` laissé vide → repli Haversine automatique,
confirmé (`matrix_source: "haversine"`). Même base Neon que le TrueNAS.

**`https://smartcovoit-production.up.railway.app`** — testé de bout en bout
(création d'événement, conducteur, passager, solve).

## 4. Worker Cloudflare (répartiteur) — fait ✅

`worker/wrangler.jsonc` pointe vers les deux instances réelles
(`PRIMARY_API_URL` = TrueNAS, `FALLBACK_API_URL` = Railway). Déployé via
`npx wrangler deploy` depuis `/worker`.

**`https://smartcovoit-worker.quentinmeyer57570.workers.dev`** — `/health`
répond, et un `solve` complet à travers le Worker renvoie bien
`matrix_source: "osrm"`, confirmant qu'il route vers le TrueNAS (primaire)
tant qu'il est en bonne santé.

Reste à faire, à ta discrétion : un domaine plus lisible que
`*.workers.dev` (route Worker sur `qmeyer.fr` ou sous-domaine dédié), et
tester le failover réel (couper le TrueNAS et vérifier que `solve` bascule
sur Railway avec `matrix_source: "haversine"`).

## 5. Frontend

Déploiement à part (Cloudflare Pages, Vercel, ou statique) — hors scope de
cette session. Point important : `NEXT_PUBLIC_API_URL` doit pointer vers
l'URL du Worker (étape 4), jamais directement vers une des deux instances
backend.

## Résumé des variables

| Variable | Où | Valeur |
|---|---|---|
| `DATABASE_URL` | TrueNAS + Railway | URL Neon (fait ✅) |
| `OSRM_URL` | TrueNAS uniquement | `http://osrm:5000` (vide sur Railway) (fait ✅) |
| `NOMINATIM_USER_AGENT` | les deux | Nom d'app + contact réel (fait ✅) |
| `CORS_ORIGINS` | les deux | URL du frontend déployé (à mettre à jour) |
| `PRIMARY_API_URL` | Worker | `https://smartcovoitlocalapi.qmeyer.fr` (fait ✅) |
| `FALLBACK_API_URL` | Worker | `https://smartcovoit-production.up.railway.app` (fait ✅) |
| `NEXT_PUBLIC_API_URL` | Frontend | `https://smartcovoit-worker.quentinmeyer57570.workers.dev` (une fois le frontend déployé) |
