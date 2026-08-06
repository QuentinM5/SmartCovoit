# OSRM — préparer les données de routage

Sans ça, le backend fonctionne quand même : le repli automatique sur
Haversine (distance à vol d'oiseau) prend le relais, silencieusement loggé
en `WARNING`. OSRM n'est donc jamais bloquant, seulement une amélioration de
précision.

## 1. Télécharger un extrait de carte

Sur [Geofabrik](https://download.geofabrik.de/), télécharge l'extrait
`.osm.pbf` couvrant ta zone (région ou pays — évite le fichier monde entier,
inutilement volumineux). Exemple pour l'Île-de-France :

```bash
mkdir -p osrm-data
curl -L -o osrm-data/map.osm.pbf https://download.geofabrik.de/europe/france/ile-de-france-latest.osm.pbf
```

## 2. Pré-traiter (extract / partition / customize)

Trois passes, via l'image Docker officielle OSRM (le profil `car` couvre le
covoiturage) :

```bash
docker run --rm -v "$PWD/osrm-data:/data" osrm/osrm-backend osrm-extract -p /opt/car.lua /data/map.osm.pbf
docker run --rm -v "$PWD/osrm-data:/data" osrm/osrm-backend osrm-partition /data/map.osrm
docker run --rm -v "$PWD/osrm-data:/data" osrm/osrm-backend osrm-customize /data/map.osrm
```

Ces commandes peuvent prendre plusieurs minutes selon la taille de
l'extrait — c'est normal, ça ne se refait qu'une fois (ou à chaque mise à
jour des données OSM).

## 3. Démarrer le service OSRM

```bash
docker compose -f infra/docker-compose.yml --profile osrm up
```

Le service écoute sur `http://localhost:5001`. Renseigne alors dans `.env` :

```
OSRM_URL=http://osrm:5000
```

(`osrm:5000` — le port interne au réseau Docker Compose, pas `5001` qui est
le port exposé côté hôte.)

## Vérifier que ça fonctionne

```bash
curl "http://localhost:5001/table/v1/driving/2.3522,48.8566;2.2950,48.8738?annotations=distance"
```

Doit renvoyer un JSON avec un champ `distances`. Si le backend log un
`WARNING` mentionnant un repli Haversine alors qu'OSRM tourne, vérifie que
`OSRM_URL` est bien accessible *depuis le conteneur backend* (`osrm`, pas
`localhost`).
