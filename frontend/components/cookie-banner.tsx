"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";
import { getConsent, setConsent } from "@/lib/telemetry";

/**
 * Bandeau de consentement — affiché tant qu'aucun choix n'a été fait
 * ("pending", cf. lib/telemetry.ts). `localStorage` n'existe pas côté
 * serveur : l'état part de `false` au premier rendu (identique
 * serveur/client, pas d'avertissement d'hydratation) et se corrige juste
 * après le montage si le consentement est encore en attente.
 */
export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // `queueMicrotask` plutôt qu'un appel synchrone (règle
    // react-hooks/set-state-in-effect) : même patron qu'ailleurs dans l'app
    // (cf. app/page.tsx) pour un state posé au montage depuis une source
    // externe (ici localStorage, pas le rendu React lui-même).
    queueMicrotask(() => {
      if (getConsent() === "pending") setVisible(true);
    });
  }, []);

  if (!visible) return null;

  function respond(choice: "accepted" | "rejected") {
    setConsent(choice);
    setVisible(false);
  }

  return (
    <div
      role="region"
      aria-label="Consentement aux cookies"
      data-surface
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface px-5 py-4"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          Ce site mesure sa fréquentation (PostHog) pour comprendre ce qui marche ou pas. Sans ton accord, seules
          des pages vues anonymes, jamais reliées à toi ni conservées d&apos;une visite à l&apos;autre, sont
          comptées.{" "}
          <Link href="/confidentialite" className="text-ink underline underline-offset-2">
            En savoir plus
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => respond("rejected")}
            className="rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium transition hover:border-ink"
          >
            Refuser
          </button>
          <Button onClick={() => respond("accepted")}>Accepter</Button>
        </div>
      </div>
    </div>
  );
}
