import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/**
 * Favicon moderne (à côté de `favicon.ico`, gardé pour les navigateurs qui
 * ne lisent que lui) — mêmes couleurs que `components/logo-mark.tsx`, en
 * valeurs fixes plutôt qu'en variables CSS : `next/og` (Satori) rend ce SVG
 * hors du contexte d'une page, sans feuille de style à résoudre.
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fbfaf7",
        }}
      >
        <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
          {/* Cercles pleins plutôt qu'en contour (comme dans LogoMark) : le
              moteur de rendu de next/og (Satori) dessine mal un cercle en
              contour seul (anneau visiblement incomplet) — un vrai
              navigateur n'a pas ce défaut, cf. logo-mark.tsx. */}
          <line x1="6" y1="9" x2="23" y2="16" stroke="#2b44cc" strokeWidth="3" strokeLinecap="round" />
          <line x1="6" y1="23" x2="23" y2="16" stroke="#e2570f" strokeWidth="3" strokeLinecap="round" />
          <circle cx="6" cy="9" r="3.5" fill="#2b44cc" />
          <circle cx="6" cy="23" r="3.5" fill="#e2570f" />
          <circle cx="23" cy="16" r="5" fill="#14171c" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
