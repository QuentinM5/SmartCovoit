/**
 * Worker de failover — squelette minimal (non déployé pour l'instant).
 *
 * Relaie chaque requête vers PRIMARY_API_URL (l'instance TrueNAS). Si elle
 * ne répond pas dans le délai imparti, ou renvoie une erreur serveur (5xx),
 * bascule sur FALLBACK_API_URL (l'instance cloud de secours). `/health` sur
 * chaque backend sert de sonde rapide avant de relayer la vraie requête,
 * pour ne pas attendre le timeout complet d'un backend mort sur chaque
 * appel.
 *
 * Pas de logique de cache ni de sticky session ici — volontairement basique,
 * cf. brief : "pas besoin de l'implémenter en détail maintenant, juste
 * prévoir la séparation des dossiers".
 */

export interface Env {
  PRIMARY_API_URL: string;
  FALLBACK_API_URL: string;
  HEALTH_TIMEOUT_MS: string;
}

async function isHealthy(baseUrl: string, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/health`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function proxy(baseUrl: string, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const target = new URL(url.pathname + url.search, baseUrl);
  return fetch(target.toString(), request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const timeoutMs = Number(env.HEALTH_TIMEOUT_MS) || 2000;

    if (await isHealthy(env.PRIMARY_API_URL, timeoutMs)) {
      try {
        return await proxy(env.PRIMARY_API_URL, request);
      } catch {
        // le health check est passé mais la vraie requête a échoué quand
        // même (panne entre-temps) -> on tente le secours ci-dessous.
      }
    }

    try {
      return await proxy(env.FALLBACK_API_URL, request);
    } catch {
      return new Response("Les deux instances backend sont indisponibles.", { status: 502 });
    }
  },
} satisfies ExportedHandler<Env>;
