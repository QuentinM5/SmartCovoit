"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { getMyEvents, type MyEvent } from "@/lib/api";
import { formatEventDate, networkMessage } from "@/lib/event-format";
import { ErrorNote, Header } from "@/components/ui";
import { LoginPrompt } from "@/app/events/[id]/event-notices";

export default function MyEventsPage() {
  const { user, loading: authLoading } = useAuth();
  const [events, setEvents] = useState<MyEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    getMyEvents()
      .then(setEvents)
      .catch((err) => setError(networkMessage(err, "Impossible de charger tes événements.")));
  }, [user]);

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
          <ul className="mt-8 flex flex-col gap-3">
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
        )}
      </main>
    </>
  );
}
