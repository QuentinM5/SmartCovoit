import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * Icône d'écran d'accueil iOS — sans elle, un ajout à l'écran d'accueil sort
 * avec une capture de la page plutôt qu'une vraie icône. Fond plein (pas de
 * transparence) : iOS applique son propre masque arrondi par-dessus.
 */
export default function AppleIcon() {
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
        <svg width="132" height="132" viewBox="0 0 32 32" fill="none">
          {/* Cercles pleins : cf. icon.tsx pour pourquoi (limite de rendu
              de Satori sur un cercle en contour seul). */}
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
