/**
 * Worker de failover.
 *
 * Relaie chaque requête directement vers PRIMARY_API_URL (l'instance
 * TrueNAS) ; si elle échoue, tarde trop, ou renvoie une erreur serveur
 * (5xx), bascule sur FALLBACK_API_URL (l'instance cloud de secours) — sauf
 * pour une écriture (POST/PATCH/DELETE) en réponse à un 5xx, où le rejeu
 * créerait un doublon plutôt qu'un secours (cf. failover-policy.ts).
 *
 * Pas de sonde `/health` séparée avant la vraie requête : ça doublait le
 * nombre d'aller-retours réseau (Worker -> tunnel -> TrueNAS deux fois de
 * suite) sur CHAQUE appel de l'app, primaire en bonne santé ou pas — la
 * cause principale de la lenteur perçue sur toutes les actions (inscription,
 * suppression, création d'événement...). `REQUEST_TIMEOUT_MS` sert
 * uniquement de filet de sécurité contre une connexion qui resterait
 * ouverte sans répondre (le cas d'un backend injoignable échoue déjà vite,
 * bien avant ce délai) — fixé largement au-dessus de `SOLVER_TIME_LIMIT_S`
 * (10s) + appel Google Routes + tracés OSRM par tournée, pour ne pas
 * basculer sur Railway (sans OSRM, donc sans tracé réel) simplement parce
 * qu'un `/solve` à plusieurs passagers a mis un peu plus de temps que prévu
 * sur le matériel partagé du TrueNAS.
 *
 * Pas de logique de cache ni de sticky session ici — volontairement basique,
 * cf. brief : "pas besoin de l'implémenter en détail maintenant, juste
 * prévoir la séparation des dossiers".
 */

import { shouldReplay, type FailureKind } from "./failover-policy";
import { pickRateLimitBucket } from "./rate-limit";

export interface Env {
  PRIMARY_API_URL: string;
  FALLBACK_API_URL: string;
  REQUEST_TIMEOUT_MS: string;
  AUTH_RATE_LIMIT: RateLimit;
  WRITE_RATE_LIMIT: RateLimit;
}

function targetUrl(baseUrl: string, request: Request): string {
  const url = new URL(request.url);
  return new URL(url.pathname + url.search, baseUrl).toString();
}

/** Porte la réponse 5xx du primaire : contrairement à un échec de
 * transport, ce n'est pas rejouable sans discrimination (cf.
 * failover-policy.ts) — on doit pouvoir la renvoyer telle quelle. */
class PrimaryServerError extends Error {
  constructor(public readonly response: Response) {
    super(`Réponse ${response.status} du backend primaire`);
  }
}

async function proxyWithTimeout(baseUrl: string, request: Request, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // `new Request(request, { signal })` copie méthode/en-têtes/corps de la
    // requête d'origine et y attache juste le signal d'abandon — même forme
    // que `fetch(url, request)` plus bas, qui marchait déjà tel quel.
    const response = await fetch(targetUrl(baseUrl, request), new Request(request, { signal: controller.signal }));
    if (response.status >= 500) {
      throw new PrimaryServerError(response);
    }
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function proxy(baseUrl: string, request: Request): Promise<Response> {
  return fetch(targetUrl(baseUrl, request), request);
}

function describe(request: Request): string {
  return `${request.method} ${new URL(request.url).pathname}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const bucket = pickRateLimitBucket(url.pathname, request.method);
    if (bucket) {
      // CF-Connecting-IP posée par Cloudflare à l'edge, jamais falsifiable
      // par le client contrairement à X-Forwarded-For.
      const ip = request.headers.get("CF-Connecting-IP") ?? "inconnue";
      const limiter = bucket === "auth" ? env.AUTH_RATE_LIMIT : env.WRITE_RATE_LIMIT;
      const { success } = await limiter.limit({ key: ip });
      if (!success) {
        return new Response("Trop de requêtes. Réessaie dans une minute.", {
          status: 429,
          headers: { "Retry-After": "60" },
        });
      }
    }

    const timeoutMs = Number(env.REQUEST_TIMEOUT_MS) || 25000;

    // `request.clone()` avant la première tentative : le corps d'une requête
    // (POST /events, /drivers, /passengers...) ne se lit qu'une fois. Sans
    // ça, un échec du primaire APRÈS lecture partielle du corps rendrait la
    // requête de repli invalide.
    const fallbackRequest = request.clone();

    try {
      return await proxyWithTimeout(env.PRIMARY_API_URL, request, timeoutMs);
    } catch (err) {
      const kind: FailureKind = err instanceof PrimaryServerError ? "server-error" : "transport";

      if (!shouldReplay(request.method, kind)) {
        // Un 5xx sur une écriture : le primaire a probablement déjà traité
        // la requête, on renvoie sa réponse telle quelle plutôt que de
        // risquer un doublon sur le secours.
        console.warn(`[failover] pas de rejeu (${kind}) pour ${describe(request)}`);
        if (err instanceof PrimaryServerError) return err.response;
        return new Response("Le backend primaire est indisponible.", { status: 503 });
      }

      console.warn(
        `[failover] bascule vers le secours (${kind}) pour ${describe(request)} :`,
        err instanceof Error ? err.message : err,
      );
    }

    try {
      const response = await proxy(env.FALLBACK_API_URL, fallbackRequest);
      if (response.status >= 500) {
        console.warn(`[failover] le secours répond ${response.status} pour ${describe(request)}`);
      }
      return response;
    } catch (err) {
      console.warn(
        `[failover] secours injoignable pour ${describe(request)} :`,
        err instanceof Error ? err.message : err,
      );
      return new Response("Les deux instances backend sont indisponibles.", { status: 502 });
    }
  },
} satisfies ExportedHandler<Env>;
