"use client";

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
 */

import posthog from "posthog-js";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

let initialized = false;

function ensureInit(): boolean {
  if (!KEY) return false;
  if (!initialized) {
    posthog.init(KEY, {
      api_host: HOST,
      // Capturée nous-mêmes (cf. components/telemetry-provider.tsx) : en
      // App Router, une navigation client ne recharge pas la page, la
      // capture automatique de PostHog la manquerait.
      capture_pageview: false,
      person_profiles: "identified_only",
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
