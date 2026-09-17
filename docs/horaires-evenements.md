# Horaires des événements

L'arrivée au rassemblement et le départ pour la dispersion sont facultatifs,
indépendants et modifiables. Le départ peut être le lendemain. Les heures sont
celles du lieu de l'événement, même si l'organisateur ou le participant consulte
la page depuis un autre fuseau.

## API et fuseau

`POST /events` et `PATCH /events/{id}` acceptent `arrival_time`, `departure_time`
(heure locale à la minute, `HH:MM`, ou `null`) et `departure_next_day` (booléen).
Les réponses exposent aussi `timezone`, identifiant IANA déterminé côté serveur
à partir des coordonnées avec timezonefinder. Aucun service de fuseau payant.

Un champ PATCH absent reste inchangé ; `null` efface un horaire. Effacer le
départ désactive aussi « lendemain ». Si les deux heures existent, la dispersion
ne peut pas précéder le rassemblement. Une heure inexistante au passage à
l'heure d'été est refusée ; une heure répétée à l'automne utilise la première
occurrence. Changer de lieu conserve les heures locales et recalcule le fuseau.

La modification d'un horaire invalide les solutions du sens concerné. Changer
la date, le lieu ou le fuseau invalide les deux sens. Les anciennes solutions
JSON sans horaires restent lisibles. L'export ICS reste en journée entière et
mentionne les horaires locaux et le fuseau dans la description.

## Estimation des tournées

Le solveur continue d'affecter les participants selon la matrice habituelle.
Le trafic n'intervient qu'après le choix des groupes, pour chaque tournée finale.

- Dispersion : un appel Mapbox `driving-traffic` à l'heure de départ explicite.
- Rassemblement : départ initial = arrivée souhaitée moins durée de la matrice ;
  au maximum trois appels pour affiner. Arrêt si l'écart d'arrivée est inférieur
  à une minute. Si la limite est atteinte, afficher la dernière paire réellement
  évaluée, sans prétendre garantir l'arrivée à l'heure.
- Sans horaire : conserver la requête actuelle `depart_at=now`.
- Horaire passé, départ estimé passé ou Mapbox indisponible : durée sans trafic.
  Sans durée pour le rassemblement, ne pas inventer de départ.
- Une tournée modifiée manuellement perd son ancien trafic et utilise sa nouvelle
  durée sans trafic pour recalculer ses horaires.

Les résultats stockent `estimated_departure_at`, `estimated_arrival_at` (instants
UTC) et `estimation_basis` (`traffic` ou `typical`). Le frontend les affiche dans
le fuseau du lieu. Aucun horaire intermédiaire de prise en charge n'est inventé.
Les protections existantes de fréquence et de calculs par compte sont conservées ;
la limite de trois appels par tournée n'est pas un plafond mensuel du compte Mapbox.

## Livraison

1. Vérifier les tests, la compilation et le SQL : depuis `backend`,
   `.venv/Scripts/python.exe -m alembic upgrade 0008:0009 --sql` sous Windows.
2. Appliquer la migration additive `0009` avant le nouveau backend. Les quatre
   colonnes sont compatibles avec l'ancien code ; ne pas les supprimer lors
   d'un simple retour arrière applicatif.
3. Déployer les deux backends selon `docs/deploiement.md`, puis exécuter depuis
   leur environnement `python -m scripts.backfill_event_timezones`. Ce traitement
   ne remplit que les fuseaux absents ; il peut être relancé et ne contacte aucune API.
4. Déployer le frontend avec `npm.cmd run deploy`, uniquement après validation
   des backends, puis vérifier création/modification et les deux sens sur un
   événement de test. Ne pas utiliser les événements réels pour les essais.

Le backend local peut pointer vers la base partagée de production : ne pas
confondre le SQL hors ligne de l'étape 1 avec une migration réellement appliquée.

### État du 17 septembre 2026

- Horaires : `6eea937` sur `design/ui-polish-2026-09` ; livraison incluant aussi
  le correctif parallèle des couvertures `288217e`, conservé sur les deux backends.
- Migration `0009` appliquée sur la base partagée ; sept fuseaux renseignés,
  aucune résolution en échec.
- NAS : ancienne image conservée sous `infra-backend:before-hours-20260917` et
  anciens fichiers dans `/mnt/Main/apps/smartcovoit-backups/before-hours-20260917.tar.gz`.
- Heroku : `288217e` déployé. Le contrôle croisé a révélé une différence de
  `JWT_SECRET` ; le secours a été aligné sur le primaire. Les jetons précédemment
  émis par l'ancienne clé Heroku nécessitent une reconnexion ; ceux du NAS restent valides.
- Retour arrière frontend : version `9f6e18f3-e770-46f9-a878-11a73a8680d5`.
- Frontend publié : `1642b203-9900-49b6-946e-d137ae6ff052`, confirmé actif à 100 %.
- Contrôles en production : création, lecture et modification entre NAS, Heroku
  et Worker ; calculs aller et retour avec Mapbox à l'heure prévue ; lendemain,
  invalidation par sens et effacement des horaires. Compte et événement de test
  supprimés. Page HTTP et nouveaux champs dans les scripts réellement servis vérifiés.
- Validation locale : 158 tests backend pour les horaires, puis 5 tests du
  correctif de couverture ; 67 tests frontend, TypeScript, lint et build réussis.
  La vérification visuelle n'a pas été réalisée : aucun navigateur disponible
  dans le runtime Browser de cette session.
