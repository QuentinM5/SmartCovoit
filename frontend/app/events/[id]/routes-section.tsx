"use client";

import { RouteLine } from "@/components/route-line";
import { RouteMap, type MapRoute } from "@/components/route-map";
import { formatDistance, formatDuration } from "@/lib/route";
import type { DragInfo, DragStartParams } from "@/lib/use-passenger-drag";
import type { EventDetail, Solution } from "@/lib/api";
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
}) {
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
        </p>
      </div>

      <SourceBanner source={solution.matrix_source} />

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
    </section>
  );
}
