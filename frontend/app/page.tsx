"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError, createEvent, type Direction } from "@/lib/api";

export default function HomePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [direction, setDirection] = useState<Direction>("ramassage");
  const [depotAddress, setDepotAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const event = await createEvent({ name, direction, depot_address: depotAddress });
      router.push(`/events/${event.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur inattendue.");
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-8 p-8">
      <div>
        <h1 className="text-2xl font-semibold">SmartCovoit</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Organise le covoiturage d&rsquo;un événement de groupe : chacun s&rsquo;inscrit avec son
          adresse, la tournée de chaque conducteur est calculée automatiquement.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Nom de l&rsquo;événement
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Sortie ski, séminaire..."
            className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>

        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="mb-1">Sens du trajet</legend>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="direction"
              className="mt-1"
              checked={direction === "ramassage"}
              onChange={() => setDirection("ramassage")}
            />
            <span>
              <strong>Ramassage</strong> — tout le monde converge vers le point commun
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="direction"
              className="mt-1"
              checked={direction === "dispersion"}
              onChange={() => setDirection("dispersion")}
            />
            <span>
              <strong>Dispersion</strong> — tout le monde part du point commun
            </span>
          </label>
        </fieldset>

        <label className="flex flex-col gap-1 text-sm">
          Adresse du point commun
          <input
            required
            value={depotAddress}
            onChange={(e) => setDepotAddress(e.target.value)}
            placeholder="Adresse complète"
            className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {submitting ? "Création..." : "Créer l’événement"}
        </button>
      </form>
    </main>
  );
}
