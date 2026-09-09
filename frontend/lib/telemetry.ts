/**
 * Télémétrie de parcours (PostHog), côté navigateur uniquement — la moitié
 * client de la télémétrie, complémentaire au journal serveur
 * (backend/app/db/event_log.py) : ce que le serveur ne voit pas (pages
 * vues, abandons de formulaire, méthode de connexion choisie). Jamais le
 * même fait des deux côtés — /solve réussi par exemple n'est PAS renvoyé
 * ici, le serveur l'a déjà avec plus de contexte (matrix_source, etc.).
 *
 * No-op silencieux si NEXT_PUBLIC_POSTHOG_KEY est absente — même
 * convention de dégradation gracieuse que le reste du repo (cf.
 * GOOGLE_OAUTH_CLIENT_ID côté backend) : PostHog est une amélioration
 * optionnelle, jamais une dépendance dure de l'app.
 *
 * Consentement (cf. components/cookie-banner.tsx), trois états :
 * - "rejected" : rien ne tourne, aucun appel PostHog, jamais.
 * - "pending" (par défaut, avant toute réponse au bandeau) : PostHog tourne
 *   en mémoire seule (`persistence: "memory"`) — pages vues comptées sans
 *   cookie ni identifiant qui survivrait au rechargement.
 * - "accepted" : persistance normale (cookie + localStorage), un même
 *   visiteur reste reconnaissable d'une session à l'autre.
 */

import posthog from "posthog-js";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
const CONSENT_STORAGE_KEY = "smartcovoit-cookie-consent";

export type ConsentState = "pending" | "accepted" | "rejected";

export function getConsent(): ConsentState {
  try {
    const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
    return stored === "accepted" || stored === "rejected" ? stored : "pending";
  } catch {
    // Stockage indisponible (navigation privée stricte, etc.) : traité comme
    // "pending" plutôt que "accepted" — on ne présume jamais un consentement.
    return "pending";
  }
}

let initialized = false;

function ensureInit(): boolean {
  if (!KEY) return false;
  if (getConsent() === "rejected") return false;
  if (!initialized) {
    posthog.init(KEY, {
      api_host: HOST,
      // Capturée nous-mêmes (cf. components/telemetry-provider.tsx) : en
      // App Router, une navigation client ne recharge pas la page, la
      // capture automatique de PostHog la manquerait.
      capture_pageview: false,
      person_profiles: "identified_only",
      persistence: getConsent() === "accepted" ? "localStorage+cookie" : "memory",
    });
    initialized = true;
  }
  return true;
}

export function capture(name: string, props?: Record<string, unknown>): void {
  if (!ensureInit()) return;
  posthog.capture(name, props);
}

export function identify(userId: string): void {
  if (!ensureInit()) return;
  posthog.identify(userId);
}

/** À l'appel de logout() (auth-provider.tsx) : sans ça, les événements du
 * prochain visiteur du même navigateur seraient attribués au compte
 * précédent. */
export function resetIdentity(): void {
  if (!ensureInit()) return;
  posthog.reset();
}

/** Appelé par le bandeau cookies (components/cookie-banner.tsx) une fois le
 * choix fait. Bascule la persistance d'une instance déjà initialisée en
 * mode mémoire plutôt que d'en recréer une : `posthog.init` une seconde fois
 * dans la même page ne réinitialiserait pas proprement la précédente. */
export function setConsent(next: "accepted" | "rejected"): void {
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, next);
  } catch {
    // Rien à faire de plus : le choix ne survivra pas au rechargement, mais
    // s'applique quand même pour la session en cours.
  }

  if (next === "rejected") {
    if (initialized) posthog.opt_out_capturing();
    return;
  }

  // "accepted" : initialise si ce n'était pas encore fait (le bandeau peut
  // être accepté avant la première capture), sinon fait juste passer
  // l'instance déjà tournante en persistance durable.
  if (!ensureInit()) return;
  posthog.set_config({ persistence: "localStorage+cookie" });
  posthog.opt_in_capturing();
}
