/**
 * Détection de colonnes pour l'import en lot (cf. import-dialog.tsx) —
 * fonctions pures, testables sans DOM ni réseau, même esprit que le reste
 * de `lib/`.
 *
 * Un export de sondage (Google Forms, typiquement) n'a pas de schéma de
 * colonnes fixe : on propose une correspondance par mots-clés sur les
 * en-têtes, mais elle reste éditable avant tout envoi — jamais imposée.
 */

export type ColumnField = "name" | "address" | "seats" | "ignore";

const KEYWORDS: Record<Exclude<ColumnField, "ignore">, string[]> = {
  name: ["nom", "name", "prenom"],
  address: ["adresse", "address", "domicile"],
  seats: ["place", "places", "siege", "sieges", "seat", "seats"],
};

/** Découpe en mots normalisés (minuscules, accents retirés) plutôt qu'une
 * simple sous-chaîne : "Nombre de places" contient littéralement "nom", un
 * `.includes("nom")` naïf le classerait à tort comme colonne de nom. */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Devine à quoi sert une colonne d'après son en-tête. Retombe sur
 * "ignore" plutôt que de deviner au hasard — mieux vaut une correspondance
 * manquante visible qu'une mauvaise correspondance silencieuse. */
export function detectColumn(header: string): ColumnField {
  const tokens = words(header);
  for (const [field, keywords] of Object.entries(KEYWORDS) as [Exclude<ColumnField, "ignore">, string[]][]) {
    if (keywords.some((kw) => tokens.includes(kw))) return field;
  }
  return "ignore";
}

/** Une place renseignée et positive => conducteur ; vide, à zéro, ou non
 * numérique => passager. C'est le signal le plus fiable disponible dans un
 * export de sondage typique ("combien de places offres-tu ? laisse vide si
 * tu n'as pas de voiture"), plus robuste qu'un texte libre à interpréter. */
export function inferRole(rawSeats: string | undefined): "driver" | "passenger" {
  const seats = parseSeats(rawSeats);
  return seats !== null && seats > 0 ? "driver" : "passenger";
}

export function parseSeats(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}
