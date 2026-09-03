"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { createEvent } from "@/lib/api";
import { AddressInput, needsSelection, type AddressValue } from "@/components/address-input";
import { Button, Field, Header, inputClass } from "@/components/ui";
import { writeNewEventSeed } from "@/lib/new-event-seed";

// Vide au premier rendu, posée juste après (cf. useEffect ci-dessous) plutôt
// qu'un `new Date()` direct dans useState : le serveur et le navigateur
// pourraient calculer "aujourd'hui" à un instant légèrement différent
// (fuseau horaire, minuit) et déclencher un avertissement d'hydratation.
function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function HomePage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [name, setName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [depot, setDepot] = useState<AddressValue>({ address: "", lat: null, lon: null });
  const [addressAvailable, setAddressAvailable] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // `queueMicrotask` plutôt qu'un appel synchrone : poser un state
    // directement dans le corps d'un effet déclenche des rendus en cascade
    // (règle react-hooks/set-state-in-effect) — différer d'un micro-tick
    // évite ça sans changer le comportement perçu.
    queueMicrotask(() => setEventDate(todayIsoDate()));
  }, []);

  const depotIncomplete = needsSelection(depot, addressAvailable);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // Filet de sécurité au cas où le formulaire serait soumis autrement que
    // par le bouton (Entrée dans un champ) : le bouton désactivé ne suffit
    // pas toujours à bloquer la soumission clavier.
    if (depotIncomplete || !eventDate || submitting) return;
    setSubmitting(true);

    // Id généré ici plutôt qu'attendu du serveur : la navigation démarre
    // avant même que POST /events ait répondu, pour que rien ne soit
    // visiblement en attente côté utilisateur. `createEvent` tourne ensuite
    // en tâche de fond (le fetch continue même après le démontage de cette
    // page) ; si elle échoue, la page de destination le détecte elle-même
    // (ses tentatives de chargement n'aboutissent jamais) et l'affiche.
    const id = crypto.randomUUID();
    writeNewEventSeed({
      id,
      name,
      depot_address: depot.address,
      depot_lat: depot.lat ?? 0,
      depot_lon: depot.lon ?? 0,
      event_date: eventDate,
      created_at: new Date().toISOString(),
      owner_id: user?.id ?? null,
      has_cover_image: false,
      drivers: [],
      passengers: [],
      comments: [],
    });
    router.push(`/events/${id}`);

    createEvent({ id, name, depot_address: depot.address, event_date: eventDate, lat: depot.lat, lon: depot.lon }).catch(
      () => {
        // Rien à faire côté ce composant, déjà en train de se démonter suite
        // à router.push — la page de destination porte la gestion de l'échec.
      },
    );
  }

  return (
    <>
      <Header />

      <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:py-14">
        <div className="mx-auto max-w-lg">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Organise les trajets du groupe, aller comme retour.
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            Crée l&apos;événement, partage le lien. Chacun s&apos;inscrit avec son adresse, et les
            trajets se calculent tout seuls — au plus court pour l&apos;ensemble du groupe.
          </p>
        </div>

        {loading ? null : !user ? (
          <div
            data-surface
            className="mx-auto mt-10 max-w-lg rounded-lg border border-line bg-surface p-5 text-sm"
          >
            <p>
              Il faut un compte pour créer un événement (et savoir que c&apos;est bien toi qui
              l&apos;organises).
            </p>
            <div className="mt-4 flex gap-3">
              {/* Lien stylé en bouton plutôt que <Button> imbriqué dans
                  <Link> : un <button> dans un <a> est du HTML invalide
                  (cf. app/not-found.tsx pour le même motif). */}
              <Link
                href="/login?next=%2F"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:opacity-85"
              >
                Se connecter
              </Link>
              <Link
                href="/signup?next=%2F"
                className="inline-flex items-center justify-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium transition hover:border-ink"
              >
                Créer un compte
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mx-auto mt-10 flex max-w-lg flex-col gap-6">
            <Field label="Nom de l'événement">
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Sortie ski, tournoi, mariage…"
                className={inputClass}
              />
            </Field>

            <Field label="Date de l'événement">
              <input
                required
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className={`${inputClass} tabular font-mono`}
              />
            </Field>

            <Field label="Adresse de l'événement" hint="Là où tout le monde se retrouve.">
              <AddressInput
                required
                value={depot}
                onChange={setDepot}
                onAvailabilityChange={setAddressAvailable}
                placeholder="Commence à taper une adresse…"
              />
            </Field>

            <div>
              <Button type="submit" disabled={depotIncomplete || !eventDate || submitting}>
                {submitting ? "Création…" : "Créer l'événement"}
              </Button>
            </div>
          </form>
        )}
      </main>
    </>
  );
}
