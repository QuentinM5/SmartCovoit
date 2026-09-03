"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { createEvent } from "@/lib/api";
import { EventForm, type EventFormValues } from "@/components/event-form";
import { ButtonLink, Header } from "@/components/ui";
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
  const [today, setToday] = useState("");

  useEffect(() => {
    // `queueMicrotask` plutôt qu'un appel synchrone : poser un state
    // directement dans le corps d'un effet déclenche des rendus en cascade
    // (règle react-hooks/set-state-in-effect) — différer d'un micro-tick
    // évite ça sans changer le comportement perçu.
    queueMicrotask(() => setToday(todayIsoDate()));
  }, []);

  function handleSubmit(values: EventFormValues) {
    // Id généré ici plutôt qu'attendu du serveur : la navigation démarre
    // avant même que POST /events ait répondu, pour que rien ne soit
    // visiblement en attente côté utilisateur. `createEvent` tourne ensuite
    // en tâche de fond (le fetch continue même après le démontage de cette
    // page) ; si elle échoue, la page de destination le détecte elle-même
    // (ses tentatives de chargement n'aboutissent jamais) et l'affiche.
    const id = crypto.randomUUID();
    writeNewEventSeed({
      id,
      name: values.name,
      depot_address: values.depot.address,
      depot_lat: values.depot.lat ?? 0,
      depot_lon: values.depot.lon ?? 0,
      event_date: values.eventDate,
      description: values.description.trim() || null,
      created_at: new Date().toISOString(),
      owner_id: user?.id ?? null,
      has_cover_image: false,
      fuel_price_per_l: null,
      consumption_l_per_100km: null,
      drivers: [],
      passengers: [],
    });
    router.push(`/events/${id}`);

    createEvent({
      id,
      name: values.name,
      depot_address: values.depot.address,
      event_date: values.eventDate,
      description: values.description.trim() || null,
      lat: values.depot.lat,
      lon: values.depot.lon,
    }).catch(() => {
      // Rien à faire côté ce composant, déjà en train de se démonter suite
      // à router.push — la page de destination porte la gestion de l'échec.
    });
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
              <ButtonLink href="/login?next=%2F">Se connecter</ButtonLink>
              <ButtonLink href="/signup?next=%2F" variant="quiet">
                Créer un compte
              </ButtonLink>
            </div>
          </div>
        ) : (
          <div className="mx-auto mt-10 max-w-lg">
            <EventForm
              // `key` : force un remontage quand `today` passe de "" à la
              // vraie date (cf. le useEffect ci-dessus) — `initialValues`
              // n'est lu par EventForm qu'à son premier rendu (useState),
              // un remontage est le seul moyen de lui faire reprendre cette
              // valeur par défaut une fois connue.
              key={today}
              initialValues={{ eventDate: today }}
              submitLabel="Créer l'événement"
              submittingLabel="Création…"
              onSubmit={handleSubmit}
            />
          </div>
        )}
      </main>
    </>
  );
}
