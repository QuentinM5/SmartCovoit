/** Jeton de session — stocké en `localStorage`, pas en cookie : le frontend
 * et l'API vivent sur des domaines différents (cf. décision du plan), un
 * cookie de session y serait tiers et bloqué par défaut par Safari. Module
 * séparé de `lib/api.ts` pour que `AuthProvider` puisse le lire sans
 * dépendre du client réseau. */

const TOKEN_KEY = "smartcovoit-token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    // localStorage indisponible (navigation privée stricte, etc.) : tant
    // pis, l'app se comporte comme si personne n'était connecté.
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Rien à faire de plus : la session ne survivra pas à un rechargement,
    // mais la requête en cours a déjà réussi.
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Idem — pas de session à effacer si le stockage n'a jamais marché.
  }
}
