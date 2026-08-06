"use client";

import { ExternalLink } from "lucide-react";
import { ROUTE_COLORS } from "@/components/route-map";
import { formatDistance, googleMapsDirectionsUrl, MAX_WAYPOINTS, type ResolvedStop } from "@/lib/route";

/**
 * Une tournée est une ligne avec des arrêts ordonnés — on la dessine comme
 * telle, à la manière d'un plan de transport, plutôt que comme une liste à
 * puces. La couleur reprend celle de la même tournée sur la carte.
 */
export function RouteLine({
  driverName,
  seats,
  distanceM,
  stops,
  index,
  onHoverChange,
}: {
  driverName: string;
  seats: number;
  distanceM: number;
  stops: ResolvedStop[];
  index: number;
  onHoverChange?: (active: boolean) => void;
}) {
  const color = ROUTE_COLORS[index % ROUTE_COLORS.length];
  const mapsUrl = googleMapsDirectionsUrl(stops);
  const passengerCount = stops.filter((s) => s.kind === "passenger").length;
  const truncated = Math.max(0, stops.length - 2 - MAX_WAYPOINTS);

  return (
    <article
      data-surface
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      onFocus={() => onHoverChange?.(true)}
      onBlur={() => onHoverChange?.(false)}
      className="animate-rise rounded-lg border border-line bg-surface p-4 transition hover:border-muted"
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
          <span className="font-mono">{formatDistance(distanceM)}</span>
          <span aria-hidden="true"> · </span>
          {passengerCount} / {seats} {seats > 1 ? "places" : "place"}
        </p>
      </header>

      <ol className="mt-3">
        {stops.map((stop, i) => {
          const last = i === stops.length - 1;
          // Même numéro que la pastille sur la carte : c'est ce qui permet de
          // faire le lien entre la liste et le trajet dessiné.
          const passengerNumber =
            stop.kind === "passenger"
              ? stops.slice(0, i + 1).filter((s) => s.kind === "passenger").length
              : null;
          return (
            <li key={i} className="grid grid-cols-[1rem_1fr_auto] items-start gap-x-3">
              <span className="grid justify-items-center" aria-hidden="true">
                <StopNode kind={stop.kind} color={color} number={passengerNumber} />
                {!last && (
                  <span className="h-6 w-0.5 rounded-full" style={{ backgroundColor: color, opacity: 0.4 }} />
                )}
              </span>

              <span className={`-mt-0.5 text-sm ${stop.kind === "passenger" ? "" : "text-muted"}`}>
                {stop.label}
              </span>

              <span className="tabular -mt-0.5 font-mono text-xs text-muted">
                {i === 0 ? "" : formatDistance(stop.cumulativeDistanceM)}
              </span>
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
