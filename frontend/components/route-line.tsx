"use client";

import { useRef } from "react";
import { ExternalLink, GripVertical } from "lucide-react";
import { ROUTE_COLORS } from "@/components/route-map";
import type { DragInfo, DragStartParams } from "@/lib/use-passenger-drag";
import {
  formatDistance,
  formatDuration,
  googleMapsDirectionsUrl,
  MAX_WAYPOINTS,
  type ResolvedStop,
} from "@/lib/route";

// Bref maintien tactile avant que le glisser démarre réellement (pas sur
// souris, où le déclenchement immédiat ne pose aucun problème) — assez
// court pour ne pas paraître poussif, assez long pour ne pas se déclencher
// sur un tap accidentel.
const TOUCH_HOLD_MS = 150;

/**
 * Une tournée est une ligne avec des arrêts ordonnés — on la dessine comme
 * telle, à la manière d'un plan de transport, plutôt que comme une liste à
 * puces. La couleur reprend celle de la même tournée sur la carte.
 */
export function RouteLine({
  driverId,
  driverName,
  seats,
  distanceM,
  durationS,
  stops,
  index,
  onHoverChange,
  onPassengerDragStart,
  isDropTarget,
  draggingPassengerId,
  pendingOvercapacity,
  onConfirmOvercapacity,
  onCancelOvercapacity,
}: {
  driverId: string;
  driverName: string;
  seats: number;
  distanceM: number;
  durationS?: number | null;
  stops: ResolvedStop[];
  index: number;
  onHoverChange?: (active: boolean) => void;
  /** Démarre un glisser depuis un arrêt passager — cf. use-passenger-drag.ts. */
  onPassengerDragStart?: (params: DragStartParams, info: DragInfo) => void;
  /** Cette tournée est survolée pendant un glisser en cours ailleurs. */
  isDropTarget?: boolean;
  /** Id du passager actuellement glissé (peut appartenir à une autre tournée). */
  draggingPassengerId?: string | null;
  /** Une dépose sur cette tournée pleine attend une confirmation explicite. */
  pendingOvercapacity?: boolean;
  onConfirmOvercapacity?: () => void;
  onCancelOvercapacity?: () => void;
}) {
  const color = ROUTE_COLORS[index % ROUTE_COLORS.length];
  const mapsUrl = googleMapsDirectionsUrl(stops);
  const passengerCount = stops.filter((s) => s.kind === "passenger").length;
  const truncated = Math.max(0, stops.length - 2 - MAX_WAYPOINTS);
  const overCapacity = passengerCount > seats;
  // Un seul geste de glisser à la fois par tournée en pratique — un minuteur
  // partagé entre les lignes de cette carte suffit, pas besoin d'une carte
  // par passager.
  const holdTimer = useRef<number | null>(null);

  function cancelPendingHold() {
    if (holdTimer.current !== null) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }

  return (
    <article
      data-surface
      data-driver-id={driverId}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      onFocus={() => onHoverChange?.(true)}
      onBlur={() => onHoverChange?.(false)}
      className={`animate-rise rounded-lg border p-4 transition ${
        isDropTarget ? "border-inbound bg-inbound/5" : "border-line bg-surface hover:border-muted"
      }`}
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="flex items-center gap-2 font-medium">
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
          {driverName}
        </h3>
        <p className="tabular text-sm text-muted">
          {durationS != null ? (
            <>
              <span className="font-mono text-ink">{formatDuration(durationS)}</span>
              <span aria-hidden="true"> · </span>
              <span className="font-mono">{formatDistance(distanceM)}</span>
            </>
          ) : (
            <span className="font-mono">{formatDistance(distanceM)}</span>
          )}
          <span aria-hidden="true"> · </span>
          <span className={overCapacity ? "text-danger" : ""}>
            {passengerCount} / {seats} {seats > 1 ? "places" : "place"}
          </span>
          {overCapacity && <span className="text-danger"> · surcapacité</span>}
        </p>
      </header>

      {pendingOvercapacity && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
          <span className="flex-1">
            Cette voiture est complète ({passengerCount}/{seats}). Déposer quand même ?
          </span>
          <button type="button" onClick={onConfirmOvercapacity} className="font-medium underline underline-offset-2">
            Confirmer
          </button>
          <button type="button" onClick={onCancelOvercapacity} className="text-muted underline underline-offset-2">
            Annuler
          </button>
        </div>
      )}

      <ol className="mt-3">
        {stops.map((stop, i) => {
          const last = i === stops.length - 1;
          // Même numéro que la pastille sur la carte : c'est ce qui permet de
          // faire le lien entre la liste et le trajet dessiné.
          const passengerNumber =
            stop.kind === "passenger"
              ? stops.slice(0, i + 1).filter((s) => s.kind === "passenger").length
              : null;
          const draggable = stop.kind === "passenger" && stop.id != null && onPassengerDragStart != null;
          const beingDragged = stop.kind === "passenger" && stop.id === draggingPassengerId;
          return (
            <li
              key={i}
              className={`grid grid-cols-[1rem_1fr_auto_1.5rem] items-start gap-x-3 ${
                beingDragged ? "opacity-30" : ""
              }`}
            >
              <span className="grid justify-items-center" aria-hidden="true">
                <StopNode kind={stop.kind} color={color} number={passengerNumber} />
                {!last && (
                  <span className="h-6 w-0.5 rounded-full" style={{ backgroundColor: color, opacity: 0.4 }} />
                )}
              </span>

              <span className={`-mt-0.5 text-sm ${stop.kind === "passenger" ? "" : "text-muted"}`}>
                {stop.label}
              </span>

              <span className="tabular -mt-0.5 flex flex-col items-end font-mono text-xs text-muted">
                {i !== 0 &&
                  (stop.cumulativeDurationS != null ? (
                    <>
                      <span>{formatDuration(stop.cumulativeDurationS)}</span>
                      <span className="text-[10px] opacity-70">
                        {formatDistance(stop.cumulativeDistanceM)}
                      </span>
                    </>
                  ) : (
                    <span>{formatDistance(stop.cumulativeDistanceM)}</span>
                  ))}
              </span>

              {draggable ? (
                // Seule zone qui démarre un glisser : le reste de la ligne
                // reste une zone de scroll 100 % native sur tactile — sans
                // ça, reprendre un scroll interrompu au milieu de la liste
                // déplace la personne au lieu de faire défiler la page.
                <button
                  type="button"
                  aria-label={`Déplacer ${stop.label} vers un autre trajet`}
                  onPointerDown={(e) => {
                    const params: DragStartParams = {
                      target: e.currentTarget,
                      pointerId: e.pointerId,
                      clientX: e.clientX,
                      clientY: e.clientY,
                    };
                    const info: DragInfo = {
                      passengerId: stop.id!,
                      passengerName: stop.label,
                      fromDriverId: driverId,
                    };
                    if (e.pointerType !== "touch") {
                      onPassengerDragStart!(params, info);
                      return;
                    }
                    // Tactile : bref maintien avant que ça bouge vraiment —
                    // vibration au moment où c'est pris, signal net que la
                    // personne "part" avec le doigt plutôt qu'un tap perdu.
                    holdTimer.current = window.setTimeout(() => {
                      holdTimer.current = null;
                      navigator.vibrate?.(10);
                      onPassengerDragStart!(params, info);
                    }, TOUCH_HOLD_MS);
                  }}
                  onPointerUp={cancelPendingHold}
                  onPointerCancel={cancelPendingHold}
                  style={{ touchAction: "none" }}
                  className="-m-2 grid shrink-0 cursor-grab place-items-center rounded p-2 text-muted transition hover:text-ink active:cursor-grabbing"
                >
                  <GripVertical className="size-4" strokeWidth={1.75} aria-hidden="true" />
                </button>
              ) : (
                <span aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>

      {mapsUrl && (
        <div className="mt-3 border-t border-line pt-3">
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium transition hover:opacity-70"
            style={{ color }}
          >
            Ouvrir dans Maps
            <ExternalLink className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
          </a>
          {truncated > 0 && (
            <p className="mt-1 text-xs text-muted">
              Maps n&apos;accepte que {MAX_WAYPOINTS} arrêts intermédiaires : les {truncated} derniers
              sont à suivre depuis cette page.
            </p>
          )}
        </div>
      )}
    </article>
  );
}

function StopNode({
  kind,
  color,
  number,
}: {
  kind: ResolvedStop["kind"];
  color: string;
  number: number | null;
}) {
  if (kind === "depot") {
    return (
      <span className="grid size-4 place-items-center rounded-full" style={{ backgroundColor: color }}>
        <span className="size-1.5 rounded-full bg-surface" />
      </span>
    );
  }
  if (kind === "driver") {
    return <span className="size-4 rounded-full" style={{ backgroundColor: color }} />;
  }
  return (
    <span
      className="grid size-4 place-items-center rounded-full bg-surface font-mono text-[9px] font-medium leading-none"
      style={{ border: `2px solid ${color}`, color }}
    >
      {number}
    </span>
  );
}
