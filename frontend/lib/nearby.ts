/**
 * Regroupement géométrique local des inscrits proches d'un même sens — miroir
 * gratuit, côté navigateur, de `backend/app/meetup_clustering.py`. Aucun
 * réseau ici : c'est ce qui permet au bloc "Qui est tout près" d'exister
 * pour tout le monde, tout le temps, avant même un calcul de tournée (cf.
 * plan — la vraie plainte était que la fonctionnalité n'existait qu'après un
 * clic enterré, pas son style).
 *
 * Le serveur revérifie le groupe avec un critère de diamètre indépendant de
 * l'ordre des arrêts (`is_nearby_group`) avant tout appel Places payant :
 * ce module n'a donc aucun contrat d'ordre à respecter, un simple glouton
 * suffit.
 */

// Miroir de DEFAULT_CLUSTER_RADIUS_M (backend/app/meetup_clustering.py).
export const NEARBY_RADIUS_M = 2000;

// Miroir de EARTH_RADIUS_M (backend/app/distance/haversine.py).
const EARTH_RADIUS_M = 6_371_000;

export interface NearbyMember {
  id: string;
  name: string;
  role: "driver" | "passenger";
  lat: number;
  lon: number;
}

function haversineM(a: NearbyMember, b: NearbyMember): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLat = lat2 - lat1;
  const dLon = toRad(b.lon) - toRad(a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

// Une inscription optimiste dont l'adresse n'avait pas encore de coordonnées
// arrive avec lat: 0, lon: 0 (cf. handleAddParticipant) : sans ce filtre on
// fabriquerait un faux groupe dans le golfe de Guinée, et on enverrait ce
// centroïde à Places une fois le bouton payant cliqué.
function hasUsableCoords(member: NearbyMember): boolean {
  if (!Number.isFinite(member.lat) || !Number.isFinite(member.lon)) return false;
  return !(member.lat === 0 && member.lon === 0);
}

/**
 * Glouton graine+rayon : chaque groupe part du premier membre encore libre
 * (la "graine") et y rattache tout membre restant à `radiusM` ou moins DE
 * CETTE GRAINE — pas du centroïde du groupe en formation. Ne renvoie que les
 * groupes d'au moins deux membres. Le serveur revérifie ce groupe avant tout
 * appel Places facturé via `is_nearby_group` (backend/app/
 * meetup_clustering.py), avec un critère indépendant de l'ordre : une
 * divergence entre les deux implémentations produit au pire un refus,
 * jamais une facture inattendue.
 */
export function groupNearbyParticipants(
  members: NearbyMember[],
  radiusM = NEARBY_RADIUS_M,
): NearbyMember[][] {
  let remaining = members.filter(hasUsableCoords);
  const groups: NearbyMember[][] = [];

  while (remaining.length > 0) {
    const [seed, ...rest] = remaining;
    const group = [seed];
    const stillRemaining: NearbyMember[] = [];
    for (const item of rest) {
      if (haversineM(seed, item) <= radiusM) group.push(item);
      else stillRemaining.push(item);
    }
    remaining = stillRemaining;
    groups.push(group);
  }

  return groups.filter((g) => g.length >= 2);
}
