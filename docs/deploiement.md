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

**`https://smartcovoitlocalapi.qmeyer.fr`** — `/health` répond (`/docs` est
fermé intentionnellement en production, cf. `Settings.enable_api_docs`),
testé de bout en bout (création d'événement, conducteur, passager, solve avec
distances OSRM réelles) depuis l'extérieur du réseau local.

Aucune IP ni hostname n'est en dur dans le code — tout passe par les
variables d'environnement.

⚠️ **Le checkout git de `/mnt/Main/apps/smartcovoit/` sur le NAS n'est pas à
jour et ne doit pas servir à déployer** : il est resté sur une branche locale
`master` très ancienne (`f84edb1`), alors que le code réellement en place a
été mis à jour par-dessus via copie directe de fichiers (`scp`), sans jamais
repasser par git. `git pull` y échoue (pas de suivi de branche configuré) et
serait de toute façon dangereux à forcer : l'historique local a trop divergé
du contenu réel du dossier pour qu'une fusion soit fiable. Pour déployer un
changement backend, identifier les fichiers modifiés (`git diff --stat` en
local entre les commits concernés) et les transférer un par un avec `scp -P
25555 <fichier> root@192.168.1.155:/mnt/Main/apps/smartcovoit/<même-chemin>`,
puis reconstruire :
```bash
docker compose -f infra/docker-compose.yml --profile osrm up -d --build backend
```
Remettre ce dossier sur un vrai suivi git propre (`git checkout main` après
avoir vérifié qu'aucun fichier réel ne serait écrasé, ou plus simplement un
nouveau clone à côté puis bascule) réglerait ça durablement, mais n'a pas été
fait — risque de casser le service en production pour un gain surtout
cosmétique tant que le contournement ci-dessus fonctionne.

## 3. Instance cloud de secours (Heroku) — à faire

Railway a d'abord servi de secours, remplacé début septembre 2026 : son essai
gratuit expiré empêchait de redéployer aux heures de pointe, incompatible
avec le rôle d'un secours censé pouvoir être reconstruit à tout moment.
DigitalOcean App Platform devait le remplacer, mais son offre a été retirée
du pack étudiant GitHub avant la mise en place — Heroku (aussi dans ce pack,
13 $ de crédit/mois pendant 24 mois) le remplace à sa place.

À déployer depuis le même repo, via `Dockerfile.backend` à la racine du
dépôt (le Dockerfile fait `COPY backend/...`) — pas dans `infra/` comme pour
`docker-compose` : le contexte de build Docker d'Heroku est toujours le
dossier contenant le Dockerfile, sans possibilité de le configurer
séparément, contrairement à `docker-compose` (`context`/`dockerfile`
distincts, cf. `infra/docker-compose.yml`). `heroku.yml` à la racine du
dépôt pilote ce build (`build.docker.web`) et recouvre le `CMD` du
Dockerfile pour écouter sur `$PORT` (assigné dynamiquement par Heroku,
contrainte propre à cette plateforme) plutôt que sur le port 8000 fixe.
Nécessite `heroku stack:set container` sur l'app avant le premier déploiement,
sans quoi Heroku ignore `heroku.yml` et tente un déploiement par buildpack.

Variables d'environnement copiées telles quelles depuis le `.env` du TrueNAS
(`heroku config:set CLÉ=valeur` ou onglet `Settings` du tableau de bord), à
une exception près : **`OSRM_URL` ne doit pas être définie** sur cette
instance (pas d'OSRM ici). En revanche **`MAPBOX_ACCESS_TOKEN` doit bien y
être défini** — c'est précisément l'absence d'OSRM sur cette instance qui la
fait basculer sur le niveau Mapbox de la chaîne de repli
(`google (sommeil) → osrm → mapbox → haversine`) : sans ce jeton ici, elle
retomberait directement sur Haversine et le solveur perdrait la matrice de
durées. `matrix_source: "mapbox"` attendu sur cette instance une fois le
jeton posé (`"haversine"` seulement s'il venait à manquer). Même base Neon
que le TrueNAS.

⚠️ **`JWT_SECRET` doit être IDENTIQUE à celle du TrueNAS**, pas une valeur
générée à part pour cette instance — contrairement à ce qu'une version
antérieure de cette page suggérait. Un jeton de session est signé par
l'instance qui a traité la connexion et vérifié par celle qui reçoit la
requête suivante ; avec deux secrets différents, une bascule de failover
déconnecterait silencieusement quiconque était déjà connecté (401 sur toute
lecture authentifiée rejouée sur le secours, cf. `worker/src/failover-policy.ts`
qui rejoue les méthodes sûres). Seule la valeur utilisée en développement
local doit rester différente de celle de production.

**`https://smartcovoit-5a6d8a97ebf8.herokuapp.com`** (fait ✅)

## 4. Worker Cloudflare (répartiteur) — fait ✅

`worker/wrangler.jsonc` pointe vers les deux instances réelles
(`PRIMARY_API_URL` = TrueNAS, `FALLBACK_API_URL` = Heroku). Déployé via
`npx wrangler deploy` depuis `/worker`.

**`https://smartcovoit-worker.quentinmeyer57570.workers.dev`** — `/health`
répond, et un `solve` complet à travers le Worker renvoie bien
`matrix_source: "osrm"`, confirmant qu'il route vers le TrueNAS (primaire)
tant qu'il est en bonne santé.

Reste à faire, à ta discrétion : un domaine plus lisible que
`*.workers.dev` (route Worker sur `qmeyer.fr` ou sous-domaine dédié), et
tester le failover réel (couper le TrueNAS et vérifier que `solve` bascule
sur Heroku avec `matrix_source: "haversine"`).

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

### Revenir à une version précédente du frontend

Cloudflare conserve chaque version déployée : le retour arrière est
instantané et ne demande aucun rebuild (donc il fonctionne même si la
machine de build est indisponible ou si le code local a changé depuis).

```bash
cd frontend
npx wrangler deployments list          # versions déployées, la plus récente en bas
npx wrangler versions list             # toutes les versions, y compris celles jamais mises en production
npx wrangler versions deploy <id>@100% # remet cette version à 100 % du trafic
```

Versions de référence (garder à jour en cas de changement majeur) :

| Version | Contenu |
|---|---|
| `388185a2-568d-4509-bedb-c228cf1de0ed` | Version active avant la refonte de la page événement : point de retour arrière immédiat. |
| `e9e7cad5-8682-4510-912e-408b70585e81` | Onglets aller/retour fusionnés + bloc « Qui est tout près », **sans** la passe de finition visuelle. Point de retour sûr avant la branche `design/ui-polish-2026-09`. |

⚠️ `npm run upload` (au lieu de `npm run deploy`) publie une version avec
son URL de preview sans toucher au trafic de production — pratique en
théorie, mais l'URL de preview d'une version sert le nouveau code avec le
routage d'assets de la version *active*, ce qui casse le rendu côté
navigateur sur une app OpenNext. Pour faire relire un changement visuel,
déployer pour de vrai et prévoir le retour arrière ci-dessus est plus
fiable.

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
   - **Heroku** — `heroku config:set CORS_ORIGINS=...` ou tableau de bord →
     app → onglet `Settings` → `Config Vars` → `CORS_ORIGINS` mise à jour
     (redéploie automatiquement).

## Résumé des variables

| Variable | Où | Valeur |
|---|---|
| `388185a2-568d-4509-bedb-c228cf1de0ed` | Version active avant la refonte de la page événement : point de retour arrière immédiat. |---|
| `DATABASE_URL` | TrueNAS + Heroku | URL Neon (fait ✅) |
| `OSRM_URL` | TrueNAS uniquement | `http://osrm:5000` (absente sur Heroku) (fait ✅) |
| `MAPBOX_ACCESS_TOKEN` | les deux, mais c'est Heroku qui en dépend réellement | Jeton Mapbox — niveau de repli entre OSRM et Haversine (`google (sommeil) → osrm → mapbox → haversine`). Sur Heroku (pas d'OSRM), c'est ce qui répare la matrice de durées du secours ; sur TrueNAS c'est redondant (OSRM répond déjà) mais sans risque à poser aussi, pour homogénéité |
| `MATRIX_CACHE_TTL_S` | les deux (optionnel) | Durée de vie (s) du cache mémoire posé sur le provider de matrices, absorbe les rappels répétés de move-stop sur les mêmes coordonnées — défaut sûr dans `config.py` (`60`) |
| `NOMINATIM_USER_AGENT` | les deux | Nom d'app + contact réel (fait ✅) |
| `CORS_ORIGINS` | les deux | URL(s) du frontend déployé, dont `https://smartcovoit.qmeyer.fr` (fait ✅) |
| `GOOGLE_ROUTES_API_KEY` | aucune des deux | **En sommeil** : vide partout depuis septembre 2026 (cf. audit facturation) — coupé délibérément, pas juste absent. Mapbox (`MAPBOX_ACCESS_TOKEN` ci-dessus) le remplace comme niveau de secours pour l'instance sans OSRM |
| `GOOGLE_PLACES_API_KEY` | TrueNAS (optionnel) | Point de rendez-vous suggéré par groupe proche (cf. POST .../meetup-point, indépendant de toute solution calculée). ⚠️ **Ne jamais poser cette clé sans avoir fixé un plafond de quota "Nearby Search (New)" dans la console Google Cloud au préalable** — même impératif que Routes API plus haut : cette fonctionnalité rouvre volontairement un risque de facturation, accepté en connaissance de cause (cf. plan). Vide = fonctionnalité absente, sans erreur. |
| `JWT_SECRET` | les deux, **obligatoire**, **valeur identique sur TrueNAS et Heroku** | Valeur aléatoire (`python -c "import secrets; print(secrets.token_urlsafe(32))"`), différente seulement de celle utilisée en développement local, jamais commitée — le backend refuse de démarrer si absente. Doit être la même sur les deux instances de production : une session ouverte sur l'une doit rester valide si une bascule de failover la fait vérifier par l'autre |
| `GOOGLE_OAUTH_CLIENT_ID` | les deux (optionnel) | Identifiant client OAuth Google (public, pas un secret) — vide = connexion Google désactivée côté backend. Créé dans Google Cloud Console (API Credentials > OAuth 2.0 Client ID > type "Web application"), avec les deux origines JavaScript autorisées (`https://smartcovoit.qmeyer.fr` et `https://smartcovoit-frontend.quentinmeyer57570.workers.dev`, cf. les deux origines frontend live) |
| `PRIMARY_API_URL` | Worker répartiteur | `https://smartcovoitlocalapi.qmeyer.fr` (fait ✅) |
| `FALLBACK_API_URL` | Worker répartiteur | `https://smartcovoit-5a6d8a97ebf8.herokuapp.com` (fait ✅) |
| `NEXT_PUBLIC_API_URL` | Frontend | `https://smartcovoit-worker.quentinmeyer57570.workers.dev` (fait ✅) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Frontend | Même valeur que `GOOGLE_OAUTH_CLIENT_ID` — exposée au navigateur pour afficher le bouton Google, ce n'est pas un secret |
| `INSTANCE_NAME` | les deux (optionnel) | `truenas` / `heroku` — distincte sur chaque hôte, sinon `/health` et le journal d'événements ne permettent pas de savoir laquelle des deux instances a répondu |
| `MAX_PARTICIPANTS_PER_EVENT`, `SOLVE_COOLDOWN_S`, `MAX_CONCURRENT_SOLVES`, `MAX_SOLUTIONS_KEPT_PER_DIRECTION` | les deux (optionnels) | Défauts sûrs dans `config.py`, à ajuster seulement si besoin réel constaté |
| `MAX_MEETUP_POINTS_PER_USER_PER_DAY` | les deux (optionnel) | Budget quotidien par compte d'appels Places (POST .../meetup-point), défaut 10 |
| `ADMIN_EMAILS` | les deux (optionnel) | Emails autorisés à lire `GET /admin/stats`, séparés par des virgules — vide = endpoint fermé à tout le monde |
