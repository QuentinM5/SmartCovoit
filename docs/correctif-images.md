# Images de couverture — correctif du 17 septembre 2026

Commit applicatif : `288217e`.

L’upload utilisait la session, mais la balise `<img>` chargeait directement
l’URL sans en-tête Authorization. Les événements sur approbation renvoyaient
donc 403, même pour leur organisateur. Le cache public de 24 heures masquait
ensuite ce défaut après un passage temporaire en accès ouvert et empêchait
le rafraîchissement fiable lors d’un remplacement.

La lecture passe maintenant par le client API authentifié, avec `cache:
"no-store"`, puis une URL blob temporaire. Le composant recharge à chaque
upload réussi et changement d’utilisateur ou de mode d’accès. Il annule les
lectures obsolètes, libère les blobs et propose de réessayer en cas d’erreur.
Le backend renvoie `Cache-Control: private, no-store` pour les couvertures.
Aucune migration de données ni modification des règles d’autorisation.

## Livraison

- Backend TrueNAS reconstruit et redémarré ; modification ciblée du seul
  en-tête de cache, en conservant les fonctionnalités déployées en parallèle.
- Secours Heroku déployé depuis le commit `288217e`.
- Frontend Cloudflare : version `224c1ae5-2880-420e-8a6c-edc1dff7e887`.
- BUILD_ID servi : `YTGmHYhiLQQvZhdzn_nLR` ; fichiers JavaScript concernés
  comparés octet pour octet avec les fichiers du build local.

Retour arrière frontend précédent : `9f6e18f3-e770-46f9-a878-11a73a8680d5`
(retire également les horaires déployés en parallèle). Préférer un correctif
en avant pour préserver ces fonctionnalités. Copie du fichier backend avant
correction sur le NAS :
`/mnt/Main/apps/smartcovoit-backups/routes-before-cover-cache-20260917.py`.

## Vérification

- 67 tests frontend et 163 tests backend réussis ; lint, TypeScript et build
  de production réussis.
- En production : lecture d’une couverture privée par son propriétaire
  vérifiée dans le backend principal, contenu non vide et cache désactivé.
- Lecture HTTP anonyme de cette couverture refusée (403) sur le primaire,
  le secours et le Worker de répartition. Aucune donnée réelle modifiée.
- Accès ouvert couvert par les tests : aucune couverture ouverte existante
  n’était disponible pour ce contrôle en production.
- Site public : HTTP 200. Contrôle visuel non effectué : aucun navigateur
  connecté n’était disponible dans cette session.

Une image déjà téléchargée lorsque l’événement était ouvert ne peut pas
être retirée à distance des copies existantes.
