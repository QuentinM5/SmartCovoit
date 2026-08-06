"use client";

import { use, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Car, Route as RouteIcon, User } from "lucide-react";
import {
  ApiError,
  addDriver,
  addPassenger,
  getEvent,
  getSolution,
  solveEvent,
  type EventDetail,
  type Solution,
} from "@/lib/api";
import { DirectionGlyph } from "@/components/direction";
import { RouteLine } from "@/components/route-line";
import { RouteMap, type MapRoute } from "@/components/route-map";
import { Button, ErrorNote, Field, Header, inputClass } from "@/components/ui";
import { formatDistance, resolveStops } from "@/lib/route";

type Role = "driver" | "passenger";

function networkMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  return fallback;
}

export default function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [solution, setSolution] = useState<Solution | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [solveError, setSolveError] = useState<string | null>(null);
  const [solving, setSolving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setEvent(await getEvent(id));
    } catch (err) {
      setLoadError(
        networkMessage(err, "Impossible de charger l'événement. Vérifie ta connexion et réessaie."),
      );
      return;
    }
    try {
      setSolution(await getSolution(id));
    } catch (err) {
      // 404 = aucune tournée calculée pour l'instant, c'est l'état de départ normal.
      if (!(err instanceof ApiError && err.status === 404)) console.error(err);
    }
  }, [id]);

  useEffect(() => {
    // Chargement initial depuis l'API externe. La règle vise les états dérivés
    // recalculés en effet ; ici l'effet synchronise bien avec un système
    // extérieur, et tout le reste de la page est piloté par des actions
    // utilisateur (inscription, calcul) qui rappellent `refresh` explicitement.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  async function handleSolve() {
    setSolveError(null);
    setSolving(true);
    try {
      setSolution(await solveEvent(id));
    } catch (err) {
      setSolveError(networkMessage(err, "Le calcul n'a pas abouti. Réessaie dans un instant."));
    } finally {
      setSolving(false);
    }
  }

  const mapRoutes: MapRoute[] = useMemo(() => {
    if (!event || !solution) return [];
    return solution.routes.map((route) => ({
      driverName: route.driver_name,
      stops: resolveStops(route, event),
    }));
  }, [event, solution]);

  if (loadError) {
    return (
      <>
        <Header back />
        <main className="mx-auto w-full max-w-3xl px-5 py-14">
          <ErrorNote>{loadError}</ErrorNote>
        </main>
      </>
    );
  }

  if (!event) {
    return (
      <>
        <Header back />
        <main className="mx-auto w-full max-w-3xl px-5 py-14 text-sm text-muted">Chargement…</main>
      </>
    );
  }

  const dispersion = event.direction === "dispersion";
  const addressLabel = dispersion ? "Adresse d'arrivée" : "Adresse de départ";
  const addressHint = dispersion ? "Où on te dépose." : "D'où on te prend.";
  const totalSeats = event.drivers.reduce((sum, d) => sum + d.seats, 0);
  const seatsLeft = totalSeats - event.passengers.length;

  return (
    <>
      <Header back />

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-5 py-8 sm:py-12">
        <section>
          <div className="flex items-start gap-4">
            <DirectionGlyph
              direction={event.direction}
              className={`mt-1 h-10 w-14 shrink-0 ${dispersion ? "text-outbound" : "text-inbound"}`}
            />
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{event.name}</h1>
              <p className="mt-1 text-sm text-muted">
                {dispersion ? "Dispersion depuis" : "Ramassage vers"}{" "}
                <span className="text-ink">{event.depot_address}</span>
              </p>
            </div>
          </div>
        </section>

        <SignupSection
          eventId={id}
          addressLabel={addressLabel}
          addressHint={addressHint}
          onAdded={refresh}
        />

        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-sm font-semibold tracking-tight">Inscrits</h2>
            <p className="tabular text-sm text-muted">
              {event.drivers.length} {event.drivers.length > 1 ? "conducteurs" : "conducteur"}
              <span aria-hidden="true"> · </span>
              {event.passengers.length} {event.passengers.length > 1 ? "passagers" : "passager"}
              {event.drivers.length > 0 && (
                <>
                  <span aria-hidden="true"> · </span>
                  <span className={seatsLeft < 0 ? "text-outbound" : ""}>
                    {seatsLeft < 0
                      ? `${-seatsLeft} de trop`
                      : `${seatsLeft} ${seatsLeft > 1 ? "places libres" : "place libre"}`}
                  </span>
                </>
              )}
            </p>
          </div>

          {event.drivers.length === 0 && event.passengers.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              Personne pour l&apos;instant. Partage l&apos;adresse de cette page au groupe.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line border-y border-line">
              {event.drivers.map((d) => (
                <li key={d.id} className="flex items-baseline gap-3 py-2.5 text-sm">
                  <Car className="size-4 shrink-0 translate-y-0.5 text-muted" strokeWidth={1.75} />
                  <span className="font-medium">{d.name}</span>
                  <span className="min-w-0 flex-1 truncate text-muted">{d.address}</span>
                  <span className="tabular shrink-0 font-mono text-xs text-muted">
                    {d.seats} {d.seats > 1 ? "places" : "place"}
                  </span>
                </li>
              ))}
              {event.passengers.map((p) => (
                <li key={p.id} className="flex items-baseline gap-3 py-2.5 text-sm">
                  <User className="size-4 shrink-0 translate-y-0.5 text-muted" strokeWidth={1.75} />
                  <span className="font-medium">{p.name}</span>
                  <span className="min-w-0 flex-1 truncate text-muted">{p.address}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button onClick={handleSolve} disabled={solving || event.drivers.length === 0}>
              <RouteIcon className="size-4" strokeWidth={1.75} aria-hidden="true" />
              {solving ? "Calcul…" : solution ? "Recalculer les tournées" : "Calculer les tournées"}
            </Button>
            {event.drivers.length === 0 && (
              <p className="text-sm text-muted">Il faut au moins un conducteur inscrit.</p>
            )}
          </div>

          {solveError && <ErrorNote>{solveError}</ErrorNote>}
        </section>

        {solution && event && (
          <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="text-sm font-semibold tracking-tight">Tournées</h2>
              <p className="tabular text-sm text-muted">
                <span className="font-mono">{formatDistance(solution.total_distance_m)}</span> au
                total
              </p>
            </div>

            {solution.matrix_source === "haversine" && (
              <p className="rounded-md border border-line bg-surface px-3 py-2 text-xs leading-relaxed text-muted">
                Distances estimées à vol d&apos;oiseau : le service de routage n&apos;était pas
                joignable. L&apos;ordre de passage reste valable, les kilomètres sont approximatifs.
              </p>
            )}

            <RouteMap routes={mapRoutes} />

            <div className="flex flex-col gap-3">
              {solution.routes.map((route, index) => {
                const driver = event.drivers.find((d) => d.id === route.driver_id);
                return (
                  <RouteLine
                    key={route.driver_id}
                    index={index}
                    driverName={route.driver_name}
                    seats={driver?.seats ?? 0}
                    distanceM={route.distance_m}
                    stops={mapRoutes[index]?.stops ?? []}
                  />
                );
              })}
            </div>
          </section>
        )}
      </main>
    </>
  );
}

function SignupSection({
  eventId,
  addressLabel,
  addressHint,
  onAdded,
}: {
  eventId: string;
  addressLabel: string;
  addressHint: string;
  onAdded: () => void;
}) {
  const [role, setRole] = useState<Role>("passenger");
  const [name, setName] = useState("");
  const [seats, setSeats] = useState(3);
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (role === "driver") {
        await addDriver(eventId, { name, seats, address });
      } else {
        await addPassenger(eventId, { name, address });
      }
      setName("");
      setAddress("");
      setSeats(3);
      onAdded();
    } catch (err) {
      setError(
        networkMessage(err, "L'inscription n'a pas abouti. Vérifie l'adresse et réessaie."),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section data-surface className="rounded-lg border border-line bg-surface p-4 sm:p-5">
      <h2 className="text-sm font-semibold tracking-tight">S&apos;inscrire</h2>

      <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-4">
        <fieldset>
          <legend className="sr-only">Je participe comme</legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { value: "passenger", label: "Passager", Icon: User },
                { value: "driver", label: "Conducteur", Icon: Car },
              ] as const
            ).map(({ value, label, Icon }) => {
              const selected = role === value;
              return (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition ${
                    selected
                      ? "border-ink bg-ink text-paper"
                      : "border-line text-muted hover:border-muted"
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={value}
                    checked={selected}
                    onChange={() => setRole(value)}
                    className="sr-only"
                  />
                  <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
                  {label}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Prénom"
              className={inputClass}
            />
          </Field>

          {role === "driver" && (
            <Field label="Places passagers" hint="Sans compter la tienne.">
              <input
                required
                type="number"
                inputMode="numeric"
                min={1}
                max={20}
                value={seats}
                onChange={(e) => setSeats(Number(e.target.value))}
                className={`${inputClass} tabular font-mono`}
              />
            </Field>
          )}
        </div>

        <Field label={addressLabel} hint={addressHint}>
          <input
            required
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 rue Principale, Québec"
            className={inputClass}
          />
        </Field>

        {error && <ErrorNote>{error}</ErrorNote>}

        <div>
          <Button type="submit" variant="quiet" disabled={submitting}>
            {submitting ? "Inscription…" : "M'inscrire"}
          </Button>
        </div>
      </form>
    </section>
  );
}
