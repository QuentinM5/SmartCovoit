"use client";

import { Car, User } from "lucide-react";
import { DeleteButton } from "@/components/delete-button";
import { ErrorNote } from "@/components/ui";
import type { Driver, Passenger } from "@/lib/api";
import type { Role } from "./signup-section";

export function RosterSection({
  drivers,
  passengers,
  seatsLeft,
  error,
  onRemove,
}: {
  drivers: Driver[];
  passengers: Passenger[];
  /** Négatif = surcapacité (plus de passagers que de places offertes). */
  seatsLeft: number;
  error: string | null;
  onRemove: (kind: Role, participantId: string) => void;
}) {
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-semibold tracking-tight">Inscrits</h2>
        <p className="tabular text-sm text-muted">
          {drivers.length} {drivers.length > 1 ? "conducteurs" : "conducteur"}
          <span aria-hidden="true"> · </span>
          {passengers.length} {passengers.length > 1 ? "passagers" : "passager"}
          {drivers.length > 0 && (
            <>
              <span aria-hidden="true"> · </span>
              <span className={seatsLeft < 0 ? "text-danger" : ""}>
                {seatsLeft < 0
                  ? `${-seatsLeft} de trop`
                  : `${seatsLeft} ${seatsLeft > 1 ? "places libres" : "place libre"}`}
              </span>
            </>
          )}
        </p>
      </div>

      {drivers.length === 0 && passengers.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          Personne pour l&apos;instant sur ce trajet. Partage l&apos;adresse de cette page au groupe.
        </p>
      ) : (
        <>
          {drivers.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium tracking-wide text-muted">
                Conducteurs · {drivers.length}
              </p>
              <ul className="mt-1.5 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {drivers.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-baseline gap-3 rounded-md border border-line px-3 py-2.5 text-sm"
                  >
                    <Car className="size-4 shrink-0 translate-y-0.5 text-muted" strokeWidth={1.75} />
                    <span className="font-medium">{d.name}</span>
                    <span className="min-w-0 flex-1 truncate text-muted">{d.address}</span>
                    <span className="tabular shrink-0 font-mono text-xs text-muted">
                      {d.seats} {d.seats > 1 ? "places" : "place"}
                    </span>
                    <DeleteButton label={d.name} onConfirm={() => onRemove("driver", d.id)} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {passengers.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium tracking-wide text-muted">
                Passagers · {passengers.length}
              </p>
              <ul className="mt-1.5 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {passengers.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-baseline gap-3 rounded-md border border-line px-3 py-2.5 text-sm"
                  >
                    <User className="size-4 shrink-0 translate-y-0.5 text-muted" strokeWidth={1.75} />
                    <span className="font-medium">{p.name}</span>
                    <span className="min-w-0 flex-1 truncate text-muted">{p.address}</span>
                    <DeleteButton label={p.name} onConfirm={() => onRemove("passenger", p.id)} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
    </section>
  );
}
