"use client";

import { usePathname } from "next/navigation";
import { ButtonLink } from "@/components/ui";
import type { Solution } from "@/lib/api";

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
