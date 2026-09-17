"use client";

import type { Direction, Solution } from "@/lib/api";
import { formatDistance, formatDuration } from "@/lib/route";

/**
 * Les chiffres de l'événement, en grand, juste sous la barre de sens : avant
 * cette bande, il fallait lire trois sections différentes pour savoir
 * combien de monde s'était inscrit et s'il restait de la place. Teintée du
 * sens affiché — ces chiffres-là, contrairement à l'en-tête au-dessus,
 * changent bien d'un onglet à l'autre.
 */
export function EventStats({
  direction,
  driverCount,
  passengerCount,
  seatsLeft,
  solution,
}: {
  direction: Direction;
  driverCount: number;
  passengerCount: number;
  /** Négatif = surcapacité (plus de passagers que de places offertes). */
  seatsLeft: number;
  solution: Solution | null;
}) {
  const outbound = direction === "dispersion";
  const accentText = outbound ? "text-outbound" : "text-inbound";
  const accentEdge = outbound ? "bg-outbound" : "bg-inbound";

  // La durée avec trafic prime quand elle existe (cf. Route.traffic_duration_s) :
  // c'est celle qui répond à "on part à quelle heure ?".
  const trafficTotal = solution?.routes.reduce<number | null>((sum, route) => {
    if (sum === null || route.traffic_duration_s == null) return null;
    return sum + route.traffic_duration_s;
  }, 0);
  const totalDuration = trafficTotal ?? solution?.total_duration_s ?? null;

  return (
    <section
      data-surface
      className="relative flex flex-wrap items-stretch gap-x-8 gap-y-5 overflow-hidden rounded-xl border border-line bg-surface py-4 pr-5 pl-6"
      aria-label="Chiffres de ce trajet"
    >
      {/* Liseré du sens affiché : rappelle l'onglet actif sans répéter son
          libellé, et donne à la bande un ancrage visuel à gauche. */}
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${accentEdge}`} />

      <Stat label="Inscrits" value={`${driverCount + passengerCount}`} />
      <Stat label={driverCount > 1 ? "Voitures" : "Voiture"} value={`${driverCount}`} />
      <Stat
        label={seatsLeft < 0 ? "Surcapacité" : "Places libres"}
        value={seatsLeft < 0 ? `${-seatsLeft}` : `${seatsLeft}`}
        tone={seatsLeft < 0 ? "text-danger" : undefined}
      />
      {solution && (
        <>
          <Stat label="Distance" value={formatDistance(solution.total_distance_m)} tone={accentText} />
          {totalDuration != null && (
            <Stat
              label={trafficTotal != null ? "Temps (trafic)" : "Temps"}
              value={formatDuration(totalDuration)}
              tone={accentText}
            />
          )}
        </>
      )}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium tracking-wider text-muted uppercase">{label}</span>
      <span className={`tabular font-mono text-2xl leading-none ${tone ?? ""}`}>{value}</span>
    </div>
  );
}
