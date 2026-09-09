import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * En-têtes de sécurité posés sur chaque réponse — absents jusqu'ici (cf.
 * audit sécurité G3) : sans eux, rien n'empêche d'encadrer le site dans une
 * iframe invisible (détournement de clic) ni de faire interpréter une
 * ressource comme autre chose que ce qu'elle déclare être.
 *
 * La CSP suit le patron officiel Next.js (nonce par requête, propagé aux
 * scripts que le framework injecte lui-même dès qu'il détecte un `nonce-`
 * dans l'en-tête sortant) plutôt qu'un `'unsafe-inline'` qui annulerait la
 * protection contre l'injection de script. Seul le script de pré-bascule du
 * thème sombre (posé à la main dans app/layout.tsx) a besoin qu'on lui passe
 * ce nonce explicitement — tout le reste (chunks Next, hydratation
 * streamée) est couvert automatiquement.
 *
 * Réservée à la production : le rechargement à chaud de `next dev` s'appuie
 * sur ses propres scripts injectés sans passer par ce mécanisme de nonce, une
 * CSP stricte y casserait le développement local sans bénéfice réel (rien
 * n'est exposé publiquement en dev).
 *
 * Convention `middleware.ts` + `runtime = "experimental-edge"` plutôt que le
 * nouveau `proxy.ts` de Next 16 (déprécie ce fichier, avertissement au build,
 * sans impact fonctionnel) : @opennextjs/cloudflare 1.20.2 refuse encore le
 * "Node.js middleware" devenu le défaut de `proxy.ts` ("Node.js middleware is
 * not currently supported. Consider switching to Edge Middleware."). À migrer
 * vers `proxy.ts` dès que l'adaptateur suit — la seule différence sera le nom
 * du fichier et de la fonction exportée (`proxy` au lieu de `middleware`),
 * sans changement de logique.
 */
export const runtime = "experimental-edge";

export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const isProd = process.env.NODE_ENV === "production";

  const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").origin;
  const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

  const csp = [
    `default-src 'self'`,
    // 'strict-dynamic' : un script chargé par un script déjà de confiance
    // (ex. le loader Google Maps, injecté dynamiquement par lib/google-maps.ts)
    // hérite de cette confiance — inutile de lister maps.googleapis.com ici.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `img-src 'self' data: blob: ${apiOrigin} https://*.googleapis.com https://*.gstatic.com`,
    `font-src 'self' https://fonts.gstatic.com`,
    `connect-src 'self' ${apiOrigin} https://*.googleapis.com ${posthogHost} https://*.posthog.com`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  if (isProd) response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
