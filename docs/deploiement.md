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

## 5. Frontend — fait ✅

Déployé sur **Cloudflare Workers** via l'adaptateur officiel
[OpenNext](https://opennext.js.org/cloudflare) (`@opennextjs/cloudflare`),
pas en export statique — ça garde `/events/[id]` comme vraie route
dynamique (rendu à la demande), plutôt que de la transformer en paramètre
de requête. Détecté et configuré automatiquement par `wrangler deploy`
depuis `/frontend` (Wrangler reconnaît un projet Next.js sans config et
installe/configure l'adaptateur tout seul).

**Déployer : `cd frontend && npm run deploy`** — surtout pas `npx wrangler deploy`.
Depuis que `wrangler.jsonc` existe, `wrangler deploy` ne relance plus le build
OpenNext : il redéploie tel quel le `.open-next/` précédent, donc une version
périmée, sans rien signaler. Le script `deploy` enchaîne bien
`opennextjs-cloudflare build && opennextjs-cloudflare deploy`.

`NEXT_PUBLIC_API_URL` vit dans `frontend/.env.production` (versionné : cette
valeur finit dans le JS envoyé au navigateur, ce n'est pas un secret) et pointe
vers le Worker de failover, jamais directement vers une instance backend.

Piège associé : `frontend/.env.local` est chargé **aussi** pendant un build de
production et prime sur `.env.production` — il avait silencieusement figé
`http://localhost:8000` dans le bundle déployé. L'override de dev vit donc
maintenant dans `.env.development.local`, qui n'est lu qu'en développement.

**`https://smartcovoit-frontend.quentinmeyer57570.workers.dev`** — testé :
page d'accueil, route dynamique `/events/[id]`, et l'URL de l'API est bien
celle du Worker (vérifié dans le bundle JS envoyé au navigateur).

À noter : OpenNext annonce un support Windows partiel (build possible mais
« unpredictable failures » selon leur propre avertissement) — a fonctionné
sans souci ici, mais WSL serait recommandé si des problèmes apparaissent
plus tard.

### Domaine personnalisé `smartcovoit.qmeyer.fr` — fait ✅

Remplace l'URL `*.workers.dev` comme adresse publique du frontend
(`*.workers.dev` reste actif en parallèle, pas désactivé). Vérifié en place :
Custom Domain Cloudflare actif, CORS ouvert sur les deux instances backend
(TrueNAS et Railway répondent `Access-Control-Allow-Origin:
https://smartcovoit.qmeyer.fr`), et `NEXT_PUBLIC_SITE_URL` (métadonnées,
sitemap, robots.txt) pointe sur ce domaine depuis le déploiement du
01/09/2026.

**Étapes qui avaient été faites, pour référence :**

1. **Cloudflare** — Workers & Pages → `smartcovoit-frontend` → Settings →
   Domains & Routes → Add → Custom Domain → `smartcovoit.qmeyer.fr`. Le DNS
   est créé automatiquement à cette étape.
2. **Google Cloud Console** — Identifiants → la clé Maps
   (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`) → Restrictions d'application (HTTP
   referrer) → `https://smartcovoit.qmeyer.fr/*` ajoutée en plus des entrées
   existantes.
3. **Backend — `CORS_ORIGINS`** sur les deux instances (TrueNAS et Railway) —
   sans ça, le nouveau domaine est bloqué par CORS malgré un DNS
   fonctionnel, piège rencontré une fois pendant ce déploiement.
   - **TrueNAS**, dans `/mnt/Main/apps/smartcovoit/.env` :
     ```bash
     sed -i -E 's|^(CORS_ORIGINS=.*)$|\1,https://smartcovoit.qmeyer.fr|' /mnt/Main/apps/smartcovoit/.env
     ```
     `docker compose restart` seul ne relit pas `env_file` — il faut
     recréer le conteneur pour que la nouvelle valeur soit prise en compte :
     ```bash
     cd /mnt/Main/apps/smartcovoit && docker compose -f infra/docker-compose.yml --profile osrm up -d
     ```
   - **Railway** — dashboard → service backend → onglet `Variables` →
     `CORS_ORIGINS` → `,https://smartcovoit.qmeyer.fr` ajouté à la valeur
     existante (Railway redéploie automatiquement).

## Résumé des variables

| Variable | Où | Valeur |
|---|---|---|
| `DATABASE_URL` | TrueNAS + Railway | URL Neon (fait ✅) |
| `OSRM_URL` | TrueNAS uniquement | `http://osrm:5000` (vide sur Railway) (fait ✅) |
| `NOMINATIM_USER_AGENT` | les deux | Nom d'app + contact réel (fait ✅) |
| `CORS_ORIGINS` | les deux | URL(s) du frontend déployé, dont `https://smartcovoit.qmeyer.fr` (fait ✅) |
| `GOOGLE_ROUTES_API_KEY` | les deux (optionnel) | Clé serveur Google Routes API, distincte de `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — vide = pas de trafic temps réel, repli OSRM automatique |
| `JWT_SECRET` | les deux, **obligatoire** | Valeur aléatoire (`python -c "import secrets; print(secrets.token_urlsafe(32))"`), différente sur chaque environnement, jamais commitée — le backend refuse de démarrer si absente |
| `GOOGLE_OAUTH_CLIENT_ID` | les deux (optionnel) | Identifiant client OAuth Google (public, pas un secret) — vide = connexion Google désactivée côté backend. Créé dans Google Cloud Console (API Credentials > OAuth 2.0 Client ID > type "Web application"), avec les deux origines JavaScript autorisées (`https://smartcovoit.qmeyer.fr` et `https://smartcovoit-frontend.quentinmeyer57570.workers.dev`, cf. les deux origines frontend live) |
| `PRIMARY_API_URL` | Worker répartiteur | `https://smartcovoitlocalapi.qmeyer.fr` (fait ✅) |
| `FALLBACK_API_URL` | Worker répartiteur | `https://smartcovoit-production.up.railway.app` (fait ✅) |
| `NEXT_PUBLIC_API_URL` | Frontend | `https://smartcovoit-worker.quentinmeyer57570.workers.dev` (fait ✅) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Frontend | Même valeur que `GOOGLE_OAUTH_CLIENT_ID` — exposée au navigateur pour afficher le bouton Google, ce n'est pas un secret |
