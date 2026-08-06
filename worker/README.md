# Worker de failover SmartCovoit

Projet Wrangler séparé (pas de dépendance vers `/backend` ou `/frontend`).
Relaie les requêtes vers l'instance backend primaire (TrueNAS) et bascule
automatiquement sur l'instance de secours (cloud) si la première ne répond
pas. Squelette pour l'instant — non déployé.

## Développement local

```bash
npm install
npm run dev
```

## Configuration

`PRIMARY_API_URL` et `FALLBACK_API_URL` sont définies dans `wrangler.jsonc`
(section `vars`) — à remplacer par les vraies URLs une fois les deux
instances backend déployées. Aucune valeur sensible ici (ce sont des URLs
publiques, pas des secrets) ; si un jour une clé est nécessaire, utiliser
`wrangler secret put` plutôt que `vars`.

## Déploiement

Non fait dans cette session — voir `/docs/deploiement.md`.
