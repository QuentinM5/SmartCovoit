"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Button, ButtonLink, ErrorNote, Header } from "@/components/ui";
import { ApiError, requestAccess, type Solution, type User } from "@/lib/api";
import { networkMessage } from "@/lib/event-format";

/**
 * Le critère d'optimisation dépend de ce qui a pu être obtenu pour ce
 * trajet (repli transparent, cf. FallbackMatrixProvider côté backend) : le
 * bandeau reflète honnêtement ce niveau plutôt que de laisser croire que
 * c'est toujours le trafic en temps réel qui a été optimisé.
 */
export function SourceBanner({ source }: { source: Solution["matrix_source"] }) {
  if (source === "google") {
    return (
      <p className="rounded-md border border-line bg-surface px-3 py-2 text-xs leading-relaxed text-muted">
        Trajets optimisés sur le temps de trajet en tenant compte du trafic en temps réel.
      </p>
    );
  }
  if (source === "osrm") {
    return (
      <p className="rounded-md border border-line bg-surface px-3 py-2 text-xs leading-relaxed text-muted">
        Trajets optimisés sur le temps de trajet typique (hors trafic en temps réel).
      </p>
    );
  }
  return (
    <p className="rounded-md border border-line bg-surface px-3 py-2 text-xs leading-relaxed text-muted">
      Distances estimées à vol d&apos;oiseau : le service de routage n&apos;était pas joignable.
      L&apos;ordre de passage reste valable, les kilomètres sont approximatifs et la carte relie
      les arrêts en pointillé plutôt que par la route.
    </p>
  );
}

/** Invite à se connecter, avec un lien de retour vers la page courante
 * (`next`) — même motif que le lien "Se connecter" du Header. */
export function LoginPrompt({ message }: { message: string }) {
  const pathname = usePathname();
  const next = encodeURIComponent(pathname);
  return (
    <div data-surface className="rounded-lg border border-line bg-surface p-4 text-sm sm:p-5">
      <p>{message}</p>
      <div className="mt-3 flex gap-3">
        <ButtonLink href={`/login?next=${next}`}>Se connecter</ButtonLink>
        <ButtonLink href={`/signup?next=${next}`} variant="quiet">
          Créer un compte
        </ButtonLink>
      </div>
    </div>
  );
}

/**
 * Remplace toute la page pour un événement en mode "approval" tant que le
 * compte courant n'est ni l'organisateur ni approuvé (cf.
 * `_check_can_view_event` côté serveur, GET /events/{id} y répond 403) —
 * rien d'autre n'est rendu, y compris le nom de l'événement, cohérent avec
 * le choix produit "tout caché" (cf. plan).
 *
 * Pas de vérification préalable du statut d'une éventuelle demande
 * existante (pas d'endpoint dédié pour ça) : un clic sur "Demander l'accès"
 * suffit à le découvrir — 201 si c'est une première demande, 409 si une
 * demande est déjà en attente (ou déjà approuvée, auquel cas recharger la
 * page suffira à voir l'événement réel).
 */
export function RestrictedEventGate({ eventId, user }: { eventId: string; user: User | null }) {
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleRequest() {
    setSubmitting(true);
    setError(null);
    try {
      await requestAccess(eventId);
      setRequested(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Une demande existe déjà (en attente, ou déjà approuvée) — dans
        // les deux cas, "en attente" est le message honnête ici : si elle
        // était déjà approuvée, un rechargement montrerait l'événement réel.
        setRequested(true);
      } else {
        setError(networkMessage(err, "La demande n'a pas abouti. Réessaie."));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Header back />
      <main className="mx-auto w-full max-w-3xl px-5 py-14">
        <div data-surface className="mx-auto max-w-lg rounded-lg border border-line bg-surface p-5 sm:p-6">
          <h1 className="text-lg font-semibold tracking-tight">Événement privé</h1>
          <p className="mt-2 text-sm text-muted">
            L&apos;organisateur de cet événement a limité son accès aux personnes approuvées.
          </p>

          {!user ? (
            <div className="mt-4">
              <LoginPrompt message="Connecte-toi pour demander l'accès à cet événement." />
            </div>
          ) : requested ? (
            <p className="mt-4 text-sm">
              Demande envoyée. L&apos;organisateur doit encore l&apos;approuver — reviens un peu plus tard.
            </p>
          ) : (
            <div className="mt-4 flex flex-col gap-2">
              {error && <ErrorNote>{error}</ErrorNote>}
              <div>
                <Button type="button" onClick={handleRequest} disabled={submitting}>
                  {submitting ? "Envoi…" : "Demander l'accès"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
