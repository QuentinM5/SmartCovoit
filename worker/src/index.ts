/**
 * Worker de failover.
 *
 * Relaie chaque requête directement vers PRIMARY_API_URL (l'instance
 * TrueNAS) ; si elle échoue, tarde trop, ou renvoie une erreur serveur
 * (5xx), bascule sur FALLBACK_API_URL (l'instance cloud de secours).
 *
 * Pas de sonde `/health` séparée avant la vraie requête : ça doublait le
 * nombre d'aller-retours réseau (Worker -> tunnel -> TrueNAS deux fois de
 * suite) sur CHAQUE appel de l'app, primaire en bonne santé ou pas — la
 * cause principale de la lenteur perçue sur toutes les actions (inscription,
 * suppression, création d'événement...). `REQUEST_TIMEOUT_MS` sert
 * uniquement de filet de sécurité contre une connexion qui resterait
 * ouverte sans répondre (le cas d'un backend injoignable échoue déjà vite,
 * bien avant ce délai) — fixé au-dessus de `SOLVER_TIME_LIMIT_S` (10s côté
 * backend) pour ne jamais couper un `/solve` légitimement long.
 *
 * Pas de logique de cache ni de sticky session ici — volontairement basique,
 * cf. brief : "pas besoin de l'implémenter en détail maintenant, juste
 * prévoir la séparation des dossiers".
 */

export interface Env {
  PRIMARY_API_URL: string;
  FALLBACK_API_URL: string;
  REQUEST_TIMEOUT_MS: string;
}

function targetUrl(baseUrl: string, request: Request): string {
  const url = new URL(request.url);
  return new URL(url.pathname + url.search, baseUrl).toString();
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
      throw new Error(`Réponse ${response.status} du backend primaire`);
    }
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function proxy(baseUrl: string, request: Request): Promise<Response> {
  return fetch(targetUrl(baseUrl, request), request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const timeoutMs = Number(env.REQUEST_TIMEOUT_MS) || 12000;

    // `request.clone()` avant la première tentative : le corps d'une requête
    // (POST /events, /drivers, /passengers...) ne se lit qu'une fois. Sans
    // ça, un échec du primaire APRÈS lecture partielle du corps rendrait la
    // requête de repli invalide.
    const fallbackRequest = request.clone();

    try {
      return await proxyWithTimeout(env.PRIMARY_API_URL, request, timeoutMs);
    } catch {
      // primaire injoignable, trop lent, ou en erreur -> on tente le secours.
    }

    try {
      return await proxy(env.FALLBACK_API_URL, fallbackRequest);
    } catch {
      return new Response("Les deux instances backend sont indisponibles.", { status: 502 });
    }
  },
} satisfies ExportedHandler<Env>;
