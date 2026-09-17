"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Car, User } from "lucide-react";
import { Button, ErrorNote } from "@/components/ui";
import { networkMessage } from "@/lib/event-format";
import { groupNearbyParticipants, type NearbyMember } from "@/lib/nearby";
import { suggestMeetupPoint, type Driver, type MeetupPoint, type Passenger } from "@/lib/api";

const MAX_NAMES_SHOWN = 6;

function otherNamesForSentence(group: NearbyMember[], highlightIds: string[]): string {
  const others = group.filter((m) => !highlightIds.includes(m.id));
  const shown = others.slice(0, MAX_NAMES_SHOWN);
  const overflow = others.length - shown.length;
  const names = shown.map((m) => m.name);
  if (overflow > 0) names.push(`${overflow} autres`);
  return names.join(", ");
}

/**
 * Bloc "Qui est tout près" — regroupement local et gratuit (haversine, cf.
 * lib/nearby.ts) des inscrits du sens affiché, visible dès qu'un groupe
 * existe, avant tout calcul de tournée. La vraie plainte n'était pas le
 * style du bouton de suggestion mais sa place dans le cycle de vie : cette
 * partie-ci n'a besoin d'aucun appel réseau pour exister, donc elle existe
 * toujours, pour tout le monde (cf. plan).
 *
 * Le vrai lieu de rendez-vous (Google Places, facturé) reste derrière un
 * clic explicite par groupe, jamais automatique : un appel facturé par
 * clic, résultat mémorisé une fois obtenu (pas de bouton "rafraîchir").
 * Purement informatif, aucun bouton "appliquer" — changer l'adresse de
 * quelqu'un sans son accord n'est pas une décision que cette page doit
 * prendre à sa place.
 */
export function NeighborGroups({
  eventId,
  drivers,
  passengers,
  canRequestMeetupPoint,
  highlightIds,
}: {
  eventId: string;
  drivers: Driver[];
  passengers: Passenger[];
  /** Le bouton payant exige un compte côté serveur (get_current_user). */
  canRequestMeetupPoint: boolean;
  /** Ids de la dernière inscription faite sur cette page — met en évidence
   * son groupe, vidé au changement de sens affiché par l'appelant. */
  highlightIds: string[];
}) {
  const members: NearbyMember[] = useMemo(
    () => [
      ...drivers.map((d): NearbyMember => ({ id: d.id, name: d.name, role: "driver", lat: d.lat, lon: d.lon })),
      ...passengers.map(
        (p): NearbyMember => ({ id: p.id, name: p.name, role: "passenger", lat: p.lat, lon: p.lon }),
      ),
    ],
    [drivers, passengers],
  );
  const groups = useMemo(() => groupNearbyParticipants(members), [members]);

  if (groups.length === 0 && highlightIds.length === 0) return null;

  if (groups.length === 0) {
    return <p className="text-sm text-muted">Personne à moins de 2 km de ton adresse pour l&apos;instant.</p>;
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">Qui est tout près</h2>
        <p className="mt-0.5 text-sm text-muted">
          À moins de 2 km les uns des autres — de bons candidats pour un même véhicule ou un point de rendez-vous
          commun.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {groups.map((group) => {
          // Ids triés joints : ne se réinitialise que si la composition du
          // groupe change, jamais à un simple re-tri ou re-rendu — porte
          // l'état "résultat mémorisé par groupe" via `key`, pas un effet.
          const groupKey = group
            .map((m) => m.id)
            .slice()
            .sort()
            .join(",");
          const highlighted = group.some((m) => highlightIds.includes(m.id));
          return (
            <NeighborGroupCard
              key={groupKey}
              eventId={eventId}
              group={group}
              highlighted={highlighted}
              highlightIds={highlightIds}
              canRequestMeetupPoint={canRequestMeetupPoint}
            />
          );
        })}
      </div>
    </section>
  );
}

function NeighborGroupCard({
  eventId,
  group,
  highlighted,
  highlightIds,
  canRequestMeetupPoint,
}: {
  eventId: string;
  group: NearbyMember[];
  highlighted: boolean;
  highlightIds: string[];
  canRequestMeetupPoint: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // "nearest" plutôt que "start"/"center" : ne saute pas si la carte est
    // déjà à l'écran (même patron que `progressRef` dans event-page-client).
    if (highlighted) ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [highlighted]);

  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [point, setPoint] = useState<MeetupPoint | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setStatus("loading");
    setError(null);
    try {
      const result = await suggestMeetupPoint(eventId, group.map((m) => m.id));
      setPoint(result.point);
      setStatus("done");
    } catch (err) {
      setStatus("idle");
      setError(networkMessage(err, "Impossible de proposer un lieu pour l'instant. Réessaie."));
    }
  }

  const shown = group.slice(0, MAX_NAMES_SHOWN);
  const overflow = group.length - shown.length;

  return (
    <div
      ref={ref}
      data-surface
      className={`rounded-md border bg-surface p-3 text-sm ${highlighted ? "border-inbound" : "border-line"}`}
    >
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {shown.map((m) => {
          const Icon = m.role === "driver" ? Car : User;
          return (
            <li key={m.id} className="inline-flex items-center gap-1.5">
              <Icon className="size-3.5 shrink-0 text-muted" strokeWidth={1.75} aria-hidden="true" />
              {m.name}
            </li>
          );
        })}
        {overflow > 0 && <li className="text-muted">… et {overflow} autres</li>}
      </ul>

      {highlighted && (
        <p className="mt-1.5 text-muted">
          Tu viens de t&apos;inscrire — {otherNamesForSentence(group, highlightIds)} sont tout près de chez toi.
        </p>
      )}

      {canRequestMeetupPoint && (
        <div className="mt-2">
          {status === "done" ? (
            point ? (
              <p>
                <span className="font-medium">{point.name}</span> — {point.address}
              </p>
            ) : (
              <p className="text-muted">Aucun lieu public identifié près de ce groupe.</p>
            )
          ) : (
            <>
              <Button type="button" variant="quiet" onClick={handleClick} disabled={status === "loading"}>
                {status === "loading" ? "Recherche…" : "Proposer un point de rendez-vous"}
              </Button>
              {error && (
                <div className="mt-1.5">
                  <ErrorNote>{error}</ErrorNote>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
