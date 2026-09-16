# Worker de failover SmartCovoit

Projet Wrangler séparé (pas de dépendance vers `/backend` ou `/frontend`).
Relaie les requêtes vers l'instance backend primaire (TrueNAS) et bascule
automatiquement sur l'instance de secours (cloud) si la première ne répond
pas. Déployé en production
(`https://smartcovoit-worker.quentinmeyer57570.workers.dev`) — c'est
l'unique URL que le frontend appelle jamais directement.

## Développement local

```bash
npm install
npm run dev
```

## Configuration

`PRIMARY_API_URL` et `FALLBACK_API_URL` sont définies dans `wrangler.jsonc`
(section `vars`). `PRIMARY_API_URL` pointe déjà sur la vraie URL TrueNAS ;
`FALLBACK_API_URL` reste à remplacer par l'URL Heroku (actuellement encore
sur l'ancienne URL Railway `https://smartcovoit-production.up.railway.app`,
mise à jour en cours ailleurs). Aucune valeur sensible ici (ce sont des URLs
publiques, pas des secrets) ; si un jour une clé est nécessaire, utiliser
`wrangler secret put` plutôt que `vars`.

## Déploiement

Voir `/docs/deploiement.md`.
