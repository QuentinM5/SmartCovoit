import type { EventDetail } from "@/lib/api";

const KEY_PREFIX = "smartcovoit-new-event-";

/**
 * Évite un aller-retour réseau redondant juste après la création d'un
 * événement : toutes les données de la page qui va s'afficher sont déjà
 * connues côté client à cet instant (l'événement vient d'être créé, sans
 * conducteur ni passager) — les repasser en main propre évite un flash
 * « Chargement… » sur la page de destination pour re-demander ce qu'on sait
 * déjà. Lecture à usage unique : consommée puis effacée, jamais de donnée
 * périmée sur une revisite ultérieure du même lien.
 */
export function writeNewEventSeed(event: EventDetail): void {
  try {
    sessionStorage.setItem(`${KEY_PREFIX}${event.id}`, JSON.stringify(event));
  } catch {
    // sessionStorage indisponible (navigation privée stricte, etc.) : tant
    // pis, la page de destination retombera sur son propre chargement.
  }
}

export function consumeNewEventSeed(id: string): EventDetail | null {
  const key = `${KEY_PREFIX}${id}`;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    sessionStorage.removeItem(key);
    return JSON.parse(raw) as EventDetail;
  } catch {
    return null;
  }
}
