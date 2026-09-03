/**
 * Décide si une requête peut être rejouée sur le secours après un échec du
 * primaire.
 *
 * Un 5xx est une RÉPONSE : le primaire a reçu la requête et l'a
 * probablement traitée (ex. la ligne a bien été insérée, mais la réponse a
 * échoué après coup). La rejouer sur Railway, contre la même base
 * partagée, est exactement ce qui crée les doublons — donc pour une
 * méthode qui écrit (POST/PATCH/DELETE), on ne rejoue pas un 5xx, on
 * renvoie tel quel.
 *
 * Un échec de transport (connexion refusée, timeout) est ambigu : le
 * primaire n'a peut-être rien reçu du tout. Le rejeu y reste le
 * comportement le moins pire, y compris pour une écriture — c'est sûr
 * grâce aux ids fournis par le client (cf. schemas.py : EventCreate.id,
 * DriverCreate.id, PassengerCreate.id), qui rendent un rejeu de POST
 * idempotent côté backend (except IntegrityError -> renvoie la ligne
 * existante).
 */
export type FailureKind = "transport" | "server-error";

// Exporté : réutilisé par rate-limit.ts (une lecture n'est jamais comptée
// contre un quota d'écriture).
export const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function shouldReplay(method: string, kind: FailureKind): boolean {
  if (kind === "transport") return true;
  return SAFE_METHODS.has(method.toUpperCase());
}
