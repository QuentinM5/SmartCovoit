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

**`https://covoitapi.qmeyer.fr`** — `/health` et `/docs` répondent, testé
de bout en bout (création d'événement, conducteur, passager, solve avec
distances OSRM réelles) depuis l'extérieur du réseau local.

Aucune IP ni hostname n'est en dur dans le code — tout passe par les
variables d'environnement.

## 3. Instance cloud de secours (Fly.io ou Railway)

Identique niveau code (même image Docker), sans le service OSRM (donc pas de
volume de données à gérer) : `OSRM_URL` reste vide, le backend bascule
automatiquement sur Haversine — transparent, déjà le comportement par défaut.

**Fly.io** :
1. `flyctl auth login` (compte à créer sur fly.io si besoin).
2. Depuis `/backend` : `flyctl launch --dockerfile ../infra/Dockerfile.backend --no-deploy`.
3. `flyctl secrets set DATABASE_URL="<url Neon>" NOMINATIM_USER_AGENT="..."`.
4. `flyctl deploy`.

**Railway** (alternative) :
1. Crée un projet, connecte le repo Git.
2. Configure le service pour utiliser `infra/Dockerfile.backend` avec le
   contexte de build à la racine du repo.
3. Ajoute les variables d'environnement dans l'onglet `Variables` du service
   (mêmes noms que `.env.example`).

Récupère l'URL publique donnée par la plateforme — c'est le `FALLBACK_API_URL`
du Worker (étape suivante).

## 4. Worker Cloudflare (répartiteur)

Squelette présent dans `/worker`, non déployé.

1. Dans `worker/wrangler.jsonc`, remplace `PRIMARY_API_URL` et
   `FALLBACK_API_URL` par les vraies URLs des étapes 2 et 3.
2. `cd worker && npm install`.
3. `npx wrangler login` (première fois).
4. `npx wrangler deploy`.
5. Ajoute un enregistrement DNS (ou une route Worker) sur le domaine choisi
   pour pointer vers ce Worker — c'est l'URL finale que le frontend appellera.

## 5. Frontend

Déploiement à part (Cloudflare Pages, Vercel, ou statique) — hors scope de
cette session. Point important : `NEXT_PUBLIC_API_URL` doit pointer vers
l'URL du Worker (étape 4), jamais directement vers une des deux instances
backend.

## Résumé des variables à renseigner à chaque étape

| Variable | Où | Valeur |
|---|---|---|
| `DATABASE_URL` | TrueNAS + cloud | URL Neon (déjà dans `.env` local) |
| `OSRM_URL` | TrueNAS uniquement | `http://osrm:5000` (vide sur le cloud) |
| `NOMINATIM_USER_AGENT` | les deux | Nom d'app + contact réel |
| `CORS_ORIGINS` | les deux | URL du frontend déployé |
| `PRIMARY_API_URL` | Worker | `https://covoitapi.qmeyer.fr` (fait ✅) |
| `FALLBACK_API_URL` | Worker | URL Fly.io/Railway |
| `NEXT_PUBLIC_API_URL` | Frontend | URL du Worker |
