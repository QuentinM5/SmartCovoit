/**
 * Décide quel quota (le cas échéant) s'applique à une requête, à l'edge
 * plutôt que dans le backend : le brute-force sur /auth/* doit mourir avant
 * de coûter un aller-retour tunnel + un hachage bcrypt, et le quota doit
 * être le même quelle que soit l'instance backend qui répondrait ensuite
 * (le worker est le seul point d'entrée du frontend).
 *
 * Une lecture (méthode sûre) n'est jamais comptée : ce n'est pas elle qui
 * coûte cher ni qui permet un brute-force.
 */
import { SAFE_METHODS } from "./failover-policy";

export type RateLimitBucket = "auth" | "write" | null;

export function pickRateLimitBucket(pathname: string, method: string): RateLimitBucket {
  if (SAFE_METHODS.has(method.toUpperCase())) return null;
  return pathname.startsWith("/auth/") ? "auth" : "write";
}
