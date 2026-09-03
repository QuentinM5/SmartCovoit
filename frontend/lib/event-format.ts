import { ApiError, type Route, type Solution } from "@/lib/api";

/** Ajoute un horaire fixe avant de parser : sans ça, `new Date("2026-09-02")`
 * est interprétée en UTC minuit, qui peut retomber sur la veille une fois
 * reconvertie dans un fuseau à l'ouest de l'UTC (ex. Amérique). */
export function formatEventDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  return date.toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function networkMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  return fallback;
}

/**
 * Déplace structurellement un arrêt passager d'une tournée à une autre
 * (aperçu optimiste) : le dernier arrêt de chaque tournée est toujours le
 * dépôt ou le domicile du conducteur (cf. solveur), on l'y laisse plutôt
 * que d'en faire la destination du lien Maps par erreur.
 */
export function moveStopOptimistic(solution: Solution, passengerId: string, toDriverId: string): Solution {
  let movedStop: Route["stops"][number] | null = null;
  const withoutPassenger = solution.routes.map((route) => {
    const stop = route.stops.find((s) => s.passenger_id === passengerId);
    if (!stop) return route;
    movedStop = stop;
    return { ...route, stops: route.stops.filter((s) => s.passenger_id !== passengerId) };
  });
  if (!movedStop) return solution;
  const stopToInsert: Route["stops"][number] = movedStop;

  return {
    ...solution,
    routes: withoutPassenger.map((route) => {
      if (route.driver_id !== toDriverId) return route;
      const boundary = route.stops[route.stops.length - 1];
      return { ...route, stops: [...route.stops.slice(0, -1), stopToInsert, boundary] };
    }),
  };
}
