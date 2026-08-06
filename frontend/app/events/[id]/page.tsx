"use client";

import { use, useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
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
      setLoadError(err instanceof ApiError ? err.message : "Impossible de charger l’événement.");
      return;
    }
    try {
      setSolution(await getSolution(id));
    } catch (err) {
      // 404 = pas encore de solution calculée, c'est l'état normal au départ.
      if (!(err instanceof ApiError && err.status === 404)) {
        console.error(err);
      }
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleSolve() {
    setSolveError(null);
    setSolving(true);
    try {
      setSolution(await solveEvent(id));
    } catch (err) {
      setSolveError(err instanceof ApiError ? err.message : "Erreur inattendue.");
    } finally {
      setSolving(false);
    }
  }

  if (loadError) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 p-8">
        <p className="text-red-600">{loadError}</p>
        <Link href="/" className="mt-4 inline-block text-sm underline">
          Retour à l&rsquo;accueil
        </Link>
      </main>
    );
  }

  if (!event) {
    return <main className="mx-auto w-full max-w-3xl flex-1 p-8 text-neutral-500">Chargement...</main>;
  }

  const totalSeats = event.drivers.reduce((sum, d) => sum + d.seats, 0);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-8">
      <header>
        <Link href="/" className="text-sm text-neutral-500 underline">
          ← Accueil
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{event.name}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {event.direction === "ramassage" ? "Ramassage" : "Dispersion"} — point commun :{" "}
          {event.depot_address}
        </p>
      </header>

      <div className="grid gap-6 sm:grid-cols-2">
        <DriverForm eventId={id} onAdded={refresh} />
        <PassengerForm eventId={id} onAdded={refresh} />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Inscrits</h2>
        <p className="text-sm text-neutral-500">
          {event.drivers.length} conducteur(s), {totalSeats} place(s) au total — {event.passengers.length}{" "}
          passager(s)
        </p>
        {(event.drivers.length > 0 || event.passengers.length > 0) && (
          <ul className="flex flex-col gap-1 text-sm">
            {event.drivers.map((d) => (
              <li key={d.id}>
                🚗 {d.name} ({d.seats} place(s)) — {d.address}
              </li>
            ))}
            {event.passengers.map((p) => (
              <li key={p.id}>🧍 {p.name} — {p.address}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <button
          onClick={handleSolve}
          disabled={solving || event.drivers.length === 0}
          className="self-start rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {solving ? "Calcul..." : "Calculer les tournées"}
        </button>
        {event.drivers.length === 0 && (
          <p className="text-sm text-neutral-500">Il faut au moins un conducteur inscrit pour calculer.</p>
        )}
        {solveError && <p className="text-sm text-red-600">{solveError}</p>}

        {solution && <SolutionView solution={solution} />}
      </section>
    </main>
  );
}

function fieldClass() {
  return "rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";
}

function DriverForm({ eventId, onAdded }: { eventId: string; onAdded: () => void }) {
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
      await addDriver(eventId, { name, seats, address });
      setName("");
      setAddress("");
      setSeats(3);
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur inattendue.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded border border-neutral-200 p-4 dark:border-neutral-800"
    >
      <h2 className="font-medium">Je conduis</h2>
      <input
        required
        placeholder="Nom"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={fieldClass()}
      />
      <input
        required
        type="number"
        min={1}
        max={20}
        placeholder="Places disponibles"
        value={seats}
        onChange={(e) => setSeats(Number(e.target.value))}
        className={fieldClass()}
      />
      <input
        required
        placeholder="Adresse de départ"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        className={fieldClass()}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-neutral-700"
      >
        {submitting ? "Ajout..." : "S’inscrire comme conducteur"}
      </button>
    </form>
  );
}

function PassengerForm({ eventId, onAdded }: { eventId: string; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await addPassenger(eventId, { name, address });
      setName("");
      setAddress("");
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur inattendue.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded border border-neutral-200 p-4 dark:border-neutral-800"
    >
      <h2 className="font-medium">Je suis passager</h2>
      <input
        required
        placeholder="Nom"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={fieldClass()}
      />
      <input
        required
        placeholder="Adresse de départ"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        className={fieldClass()}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-neutral-700"
      >
        {submitting ? "Ajout..." : "S’inscrire comme passager"}
      </button>
    </form>
  );
}

function SolutionView({ solution }: { solution: Solution }) {
  return (
    <div className="flex flex-col gap-4">
      {solution.matrix_source === "haversine" && (
        <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Distances estimées à vol d&rsquo;oiseau (OSRM non configuré ou temporairement indisponible).
        </p>
      )}
      <p className="text-sm text-neutral-500">
        Distance totale de la flotte : {(solution.total_distance_m / 1000).toFixed(1)} km
      </p>

      <div className="flex flex-col gap-4">
        {solution.routes.map((route) => (
          <div
            key={route.driver_id}
            className="rounded border border-neutral-200 p-4 dark:border-neutral-800"
          >
            <h3 className="font-medium">
              {route.driver_name} — {(route.distance_m / 1000).toFixed(1)} km
            </h3>
            <ol className="mt-2 flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-400">
              {route.stops.map((stop, i) => (
                <li key={i}>
                  {stop.passenger_name ?? (stop.node === 0 ? "Dépôt" : "Domicile du conducteur")} —{" "}
                  {(stop.cumulative_distance_m / 1000).toFixed(1)} km
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}
