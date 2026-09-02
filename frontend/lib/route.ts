/**
 * Transforme une tournée renvoyée par l'API en une séquence d'arrêts affichables.
 *
 * L'API ne renvoie pas les coordonnées de chaque arrêt, seulement son numéro de
 * nœud et l'identifiant du passager le cas échéant. On les retrouve depuis
 * l'événement sans refaire l'arithmétique de numérotation du solveur :
 * un arrêt porte un passager -> on cherche ce passager par son id ; c'est le
 * nœud 0 -> c'est le point de rendez-vous ; sinon c'est le domicile du
 * conducteur de cette tournée.
 */

import type { EventDetail, Route, Stop } from "@/lib/api";

export type StopKind = "depot" | "driver" | "passenger";

export interface ResolvedStop {
  kind: StopKind;
  label: string;
  lat: number;
  lon: number;
  cumulativeDistanceM: number;
  cumulativeDurationS?: number | null;
  /** Id du passager — présent uniquement pour kind === "passenger", utilisé
   * pour le déplacer par glisser-déposer (cf. use-passenger-drag.ts). */
  id?: string;
}

export function resolveStops(route: Route, event: EventDetail): ResolvedStop[] {
  const driver = event.drivers.find((d) => d.id === route.driver_id);

  return route.stops.flatMap((stop: Stop): ResolvedStop[] => {
    if (stop.passenger_id) {
      const passenger = event.passengers.find((p) => p.id === stop.passenger_id);
      if (!passenger) return [];
      return [
        {
          kind: "passenger",
          label: passenger.name,
          lat: passenger.lat,
          lon: passenger.lon,
          cumulativeDistanceM: stop.cumulative_distance_m,
          cumulativeDurationS: stop.cumulative_duration_s,
          id: passenger.id,
        },
      ];
    }

    if (stop.node === 0) {
      return [
        {
          kind: "depot",
          label: event.depot_address,
          lat: event.depot_lat,
          lon: event.depot_lon,
          cumulativeDistanceM: stop.cumulative_distance_m,
          cumulativeDurationS: stop.cumulative_duration_s,
        },
      ];
    }

    if (!driver) return [];
    // Le domicile du conducteur est son point de départ en ramassage, mais son
    // point d'arrivée en dispersion. La formulation « chez X » évite au passage
    // l'élision fautive de « Départ de Olivier ».
    return [
      {
        kind: "driver",
        label:
          driver.direction === "dispersion"
            ? `Retour chez ${driver.name}`
            : `Départ de chez ${driver.name}`,
        lat: driver.lat,
        lon: driver.lon,
        cumulativeDistanceM: stop.cumulative_distance_m,
        cumulativeDurationS: stop.cumulative_duration_s,
      },
    ];
  });
}

/**
 * Lien d'itinéraire Google Maps. Aucune clé API nécessaire, et sur mobile le
 * lien ouvre directement l'application Maps installée.
 *
 * Limite du format : Google accepte 9 étapes intermédiaires, mais seulement 3
 * depuis un navigateur mobile. Au-delà on tronque plutôt que de produire une
 * URL que Maps refusera — l'ordre de passage reste lisible sur la page.
 */
export const MAX_WAYPOINTS = 9;

export function googleMapsDirectionsUrl(stops: ResolvedStop[]): string | null {
  if (stops.length < 2) return null;

  const coord = (s: ResolvedStop) => `${s.lat},${s.lon}`;
  const origin = stops[0];
  const destination = stops[stops.length - 1];
  const waypoints = stops.slice(1, -1).slice(0, MAX_WAYPOINTS);

  const params = new URLSearchParams({
    api: "1",
    origin: coord(origin),
    destination: coord(destination),
    travelmode: "driving",
  });
  if (waypoints.length > 0) {
    params.set("waypoints", waypoints.map(coord).join("|"));
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toLocaleString("fr-CA", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} km`;
}

export function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes.toString().padStart(2, "0")}`;
}
