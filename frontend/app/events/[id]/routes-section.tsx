"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { RouteLine } from "@/components/route-line";
import { RouteMap, type MapRoute } from "@/components/route-map";
import { Button, ErrorNote } from "@/components/ui";
import { formatMoney, routeCostEuros } from "@/lib/cost";
import { networkMessage } from "@/lib/event-format";
import { formatDistance, formatDuration } from "@/lib/route";
import type { DragInfo, DragStartParams } from "@/lib/use-passenger-drag";
import { getMeetupSuggestions, type EventDetail, type MeetupSuggestion, type Solution } from "@/lib/api";
import { SourceBanner } from "./event-notices";

export function RoutesSection({
  solution,
  event,
  mapRoutes,
  highlighted,
  onHoverChange,
  canManage,
  onPassengerDragStart,
  hoveredDriverId,
  draggingPassengerId,
  pendingOvercapacityDriverId,
  onConfirmOvercapacity,
  onCancelOvercapacity,
  hasManualChanges,
}: {
  solution: Solution;
  event: EventDetail;
  mapRoutes: MapRoute[];
  highlighted: number | null;
  onHoverChange: (index: number | null) => void;
  canManage: boolean;
  /** Démarre un glisser depuis un arrêt passager — réservé à l'organisateur
   * côté serveur (move-stop), ne pas proposer un geste voué à échouer à qui
   * ne peut pas l'exécuter. */
  onPassengerDragStart?: (params: DragStartParams, info: DragInfo) => void;
  hoveredDriverId: string | null;
  draggingPassengerId: string | null;
  pendingOvercapacityDriverId: string | null;
  onConfirmOvercapacity: () => void;
  onCancelOvercapacity: () => void;
  /** Un glisser-déposer a été fait depuis le dernier calcul complet : les
   * tournées affichées ne sont plus le résultat de l'optimisation. */
  hasManualChanges: boolean;
}) {
  const costParams = { fuelPricePerL: event.fuel_price_per_l, consumptionLPer100Km: event.consumption_l_per_100km };
  const totalCost = routeCostEuros(solution.total_distance_m, costParams);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-semibold tracking-tight">Trajets</h2>
        <p className="tabular text-sm text-muted">
          {solution.total_duration_s != null ? (
            <>
              <span className="font-mono text-ink">{formatDuration(solution.total_duration_s)}</span> ·{" "}
              <span className="font-mono">{formatDistance(solution.total_distance_m)}</span> au total
            </>
          ) : (
            <>
              <span className="font-mono">{formatDistance(solution.total_distance_m)}</span> au total
            </>
          )}
          <span aria-hidden="true"> · </span>
          <span className="font-mono">{formatMoney(totalCost, event.currency)}</span> de carburant estimé
        </p>
      </div>

      <SourceBanner source={solution.matrix_source} />

      {hasManualChanges && (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          Des modifications manuelles ont été faites depuis le dernier calcul. Les trajets ne sont plus optimaux.
        </p>
      )}

      <RouteMap routes={mapRoutes} highlightedRoute={highlighted} />

      <div className="grid gap-3 lg:grid-cols-2">
        {solution.routes.map((route, index) => {
          const driver = event.drivers.find((d) => d.id === route.driver_id);
          return (
            <RouteLine
              key={route.driver_id}
              driverId={route.driver_id}
              index={index}
              driverName={route.driver_name}
              seats={driver?.seats ?? 0}
              distanceM={route.distance_m}
              durationS={route.duration_s}
              cost={routeCostEuros(route.distance_m, costParams)}
              currency={event.currency}
              stops={mapRoutes[index]?.stops ?? []}
              onHoverChange={(active) => onHoverChange(active ? index : null)}
              onPassengerDragStart={canManage ? onPassengerDragStart : undefined}
              isDropTarget={hoveredDriverId === route.driver_id}
              draggingPassengerId={draggingPassengerId}
              pendingOvercapacity={pendingOvercapacityDriverId === route.driver_id}
              onConfirmOvercapacity={onConfirmOvercapacity}
              onCancelOvercapacity={onCancelOvercapacity}
            />
          );
        })}
      </div>

      <MeetupSuggestions eventId={event.id} direction={solution.direction} passengers={event.passengers} />
    </section>
  );
}

/**
 * Regroupe les passagers proches d'une même tournée et suggère un vrai
 * lieu de rassemblement — cf. backend/app.meetup_clustering. Calculée à la
 * demande (bouton explicite), jamais automatiquement : chaque appel coûte
 * des requêtes Google Places facturées. Purement informatif, aucun bouton
 * "appliquer" — changer l'adresse d'un passager sans son accord n'est pas
 * une décision que cette page doit pouvoir prendre à sa place.
 */
function MeetupSuggestions({
  eventId,
  direction,
  passengers,
}: {
  eventId: string;
  direction: Solution["direction"];
  passengers: EventDetail["passengers"];
}) {
  const [suggestions, setSuggestions] = useState<MeetupSuggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      setSuggestions(await getMeetupSuggestions(eventId, direction));
    } catch (err) {
      setError(networkMessage(err, "Impossible de charger les suggestions. Réessaie."));
    } finally {
      setLoading(false);
    }
  }

  function passengerNames(ids: string[]): string {
    return ids
      .map((id) => passengers.find((p) => p.id === id)?.name)
      .filter((name): name is string => !!name)
      .join(", ");
  }

  if (suggestions === null) {
    return (
      <div>
        <button
          type="button"
          onClick={handleClick}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted transition hover:text-ink disabled:opacity-45"
        >
          <Users className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
          {loading ? "Recherche…" : "Voir les suggestions de regroupement"}
        </button>
        {error && (
          <div className="mt-2">
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}
      </div>
    );
  }

  if (suggestions.length === 0) {
    return <p className="text-xs text-muted">Aucun regroupement à suggérer pour ces trajets.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">Points de rassemblement suggérés</p>
      {suggestions.map((s, i) => (
        <div key={i} data-surface className="rounded-md border border-line bg-surface p-3 text-sm">
          <p>
            <span className="font-medium">{passengerNames(s.passenger_ids)}</span> sont proches les uns des
            autres — rendez-vous suggéré :
          </p>
          <p className="mt-1 text-muted">
            <span className="font-medium text-ink">{s.name}</span> — {s.address}
          </p>
        </div>
      ))}
      <div>
        <Button type="button" variant="quiet" onClick={handleClick} disabled={loading}>
          {loading ? "Recherche…" : "Rafraîchir"}
        </Button>
      </div>
    </div>
  );
}
