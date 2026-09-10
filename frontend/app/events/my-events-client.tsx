"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Share2 } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { getMyEvents, getMyImpact, type Impact, type MyEvent } from "@/lib/api";
import { formatEventDate, networkMessage } from "@/lib/event-format";
import { ErrorNote, Header } from "@/components/ui";
import { LoginPrompt } from "@/app/events/[id]/event-notices";

export function MyEventsPageClient() {
  const { user, loading: authLoading } = useAuth();
  const [events, setEvents] = useState<MyEvent[] | null>(null);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    getMyEvents()
      .then(setEvents)
      .catch((err) => setError(networkMessage(err, "Impossible de charger tes événements.")));
    // Échec silencieux pour l'impact : c'est un bonus d'affichage, pas une
    // donnée dont l'absence doit bloquer le reste de la page.
    getMyImpact()
      .then(setImpact)
      .catch(() => {});
  }, [user]);

  // Comparaison de chaînes ISO (YYYY-MM-DD), valide lexicographiquement —
  // pas de souci d'hydratation ici, cette section ne se rend qu'une fois
  // `events` chargé côté client (bien après l'hydratation initiale).
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events?.filter((e) => e.event_date >= today) ?? [];
  const past = events?.filter((e) => e.event_date < today) ?? [];

  return (
    <>
      <Header back />
      <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:py-14">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Mes événements</h1>

        {authLoading ? null : !user ? (
          <div className="mt-8">
            <LoginPrompt message="Connecte-toi pour voir tes événements." />
          </div>
        ) : error ? (
          <div className="mt-8">
            <ErrorNote>{error}</ErrorNote>
          </div>
        ) : events === null ? (
          <p className="mt-8 text-sm text-muted">Chargement…</p>
        ) : events.length === 0 ? (
          <p className="mt-8 text-sm text-muted">
            Aucun événement pour l&apos;instant.{" "}
            <Link href="/" className="text-ink underline underline-offset-2">
              Crées-en un
            </Link>
            .
          </p>
        ) : (
          <div className="mt-8 flex flex-col gap-10">
            {impact && impact.events_count > 0 && <ImpactBanner impact={impact} />}

            {upcoming.length > 0 && (
              <EventGroup title="À venir" events={upcoming} />
            )}
            {past.length > 0 && <EventGroup title="Passés" events={past} />}
          </div>
        )}
      </main>
    </>
  );
}

function EventGroup({ title, events }: { title: string; events: MyEvent[] }) {
  return (
    <div>
      <h2 className="text-xs font-medium tracking-wide text-muted uppercase">{title}</h2>
      <ul className="mt-2 flex flex-col gap-3">
        {events.map((event) => (
          <li key={event.id}>
            <Link
              href={`/events/${event.id}`}
              data-surface
              className="block rounded-lg border border-line bg-surface p-4 transition hover:border-ink"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="font-medium">{event.name}</span>
                <span className="text-xs text-muted">{event.is_owner ? "Organisateur" : "Inscrit"}</span>
              </div>
              <p className="mt-1 text-sm text-muted capitalize">{formatEventDate(event.event_date)}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Estimation, pas une mesure exacte — cf. backend/app/impact.py pour la
 * méthodologie complète. La formuler autrement ("tu as économisé...")
 * laisserait croire à une précision que le calcul n'a pas.
 */
function ImpactBanner({ impact }: { impact: Impact }) {
  const text = `J'ai économisé environ ${impact.co2_saved_kg} kg de CO2 en covoiturant sur ${impact.events_count} événement${impact.events_count > 1 ? "s" : ""} avec SmartCovoit !`;
  const [shared, setShared] = useState(false);

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ text });
      } catch {
        // Annulé par la personne, ou API indisponible malgré sa présence — rien à faire.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch {
      window.prompt("Copie ce texte :", text);
    }
  }

  return (
    <div data-surface className="rounded-lg border border-line bg-surface p-4 sm:p-5">
      <p className="text-sm">
        Tu as économisé environ <span className="font-semibold">{impact.co2_saved_kg} kg</span> de CO2 en
        covoiturant sur <span className="font-semibold">{impact.events_count}</span> événement
        {impact.events_count > 1 ? "s" : ""}.
      </p>
      <p className="mt-1 text-xs text-muted">
        Estimation, pas une mesure exacte : distance à vol d&apos;oiseau entre ton adresse et le point de
        rendez-vous, aller-retour, convertie via un facteur d&apos;émission moyen (ADEME).
      </p>
      <button
        type="button"
        onClick={handleShare}
        className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted transition hover:text-ink"
      >
        <Share2 className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
        {shared ? "Copié !" : "Partager"}
      </button>
    </div>
  );
}
