import type { Metadata } from "next";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { ApiError, coverImageUrl, getEvent, type EventDetail } from "@/lib/api";
import { EventPageClient } from "./event-page-client";

type Params = { id: string };

/**
 * Lit l'événement via la liaison de service Cloudflare vers smartcovoit-worker
 * plutôt qu'un fetch() public : deux Workers du même compte qui se
 * fetch()ent l'un l'autre par leur domaine *.workers.dev se heurtent à la
 * protection anti-boucle de Cloudflare (elle répond 404, sans passer par le
 * vrai backend). La liaison de service route en interne, sans repasser par
 * le réseau public — cf. binding API_WORKER dans wrangler.jsonc. Repli sur
 * le fetch public si le binding est indisponible (`next dev` sans émulation
 * Cloudflare, par exemple).
 */
async function getEventForMetadata(id: string): Promise<EventDetail> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const response = await env.API_WORKER.fetch(`https://smartcovoit-worker.internal/events/${id}`);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { detail?: string } | null;
      throw new ApiError(response.status, body?.detail ?? `Erreur ${response.status}`);
    }
    return response.json() as Promise<EventDetail>;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    return getEvent(id);
  }
}

/**
 * Un événement a un nom et un nombre de participants qui lui sont propres :
 * sans ceci, toutes les pages d'événements partagent le même <title> que
 * l'accueil, ce qui rend les onglets et les partages de lien indistincts.
 *
 * `noindex` : ces pages contiennent des noms et adresses de particuliers et
 * ne sont censées circuler que par lien direct, jamais via une recherche —
 * la lecture reste publique par ce lien même une fois l'authentification en
 * place, seules les actions d'écriture exigent un compte (cf. matrice
 * d'autorisation dans routes.py).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id } = await params;

  try {
    const event = await getEventForMetadata(id);
    const driverCount = event.drivers.length;
    const passengerCount = event.passengers.length;
    const description = `Covoiturage « ${event.name} » — ${driverCount} conducteur${driverCount > 1 ? "s" : ""}, ${passengerCount} passager${passengerCount > 1 ? "s" : ""}. Inscris-toi et vois qui prend qui.`;
    // Absente si l'organisateur n'en a pas mis — un lien partagé sans image
    // retombe sur l'aperçu par défaut de la plateforme, pas une image cassée.
    const images = event.has_cover_image ? [coverImageUrl(id)] : undefined;

    return {
      title: event.name,
      description,
      alternates: { canonical: `/events/${id}` },
      openGraph: { title: event.name, description, images },
      twitter: { title: event.name, description, images },
      robots: { index: false, follow: false },
    };
  } catch (err) {
    return {
      title: err instanceof ApiError && err.status === 404 ? "Événement introuvable" : "Événement",
      alternates: { canonical: `/events/${id}` },
      robots: { index: false, follow: false },
    };
  }
}

export default async function EventPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  return <EventPageClient id={id} />;
}
