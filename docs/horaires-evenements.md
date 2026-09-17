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
