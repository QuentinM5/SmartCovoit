/**
 * Repère visuel de la marque : reprend le vocabulaire déjà posé par
 * `DirectionGlyph` (components/direction.tsx), nœuds et lignes plutôt qu'une
 * icône générique — mais ici les deux sens à la fois (indigo qui converge,
 * vermillon qui part), puisque ce repère représente l'app entière et pas un
 * trajet précis. Couleurs via variables CSS (pas de hex en dur) pour suivre
 * automatiquement le mode sombre, comme le reste de la palette.
 *
 * Composant pur, sans hook ni "use client" : réutilisable tel quel dans
 * `app/icon.tsx` et `app/opengraph-image.tsx`, qui rendent du JSX hors du
 * cycle de rendu React classique (`next/og`).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" fill="none">
      <line x1="6" y1="9" x2="23" y2="16" stroke="var(--color-inbound)" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="6" y1="23" x2="23" y2="16" stroke="var(--color-outbound)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="6" cy="9" r="3.25" fill="none" stroke="var(--color-inbound)" strokeWidth="2" />
      <circle cx="6" cy="23" r="3.25" fill="none" stroke="var(--color-outbound)" strokeWidth="2" />
      <circle cx="23" cy="16" r="4.5" fill="currentColor" />
    </svg>
  );
}
