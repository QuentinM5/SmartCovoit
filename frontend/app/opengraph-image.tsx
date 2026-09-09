import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "SmartCovoit";

/**
 * Image de partage par défaut (accueil et toute page sans image plus
 * spécifique — les pages d'événement ont la leur, cf. events/[id]/page.tsx).
 * Générée au build, pas un fichier statique : les couleurs restent les
 * mêmes constantes que globals.css (pas de variables CSS ici, `next/og`
 * n'a pas de contexte de page pour les résoudre).
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#fbfaf7",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <svg width="72" height="72" viewBox="0 0 32 32" fill="none">
            {/* Cercles pleins : cf. app/icon.tsx pour pourquoi (limite de
                rendu de Satori sur un cercle en contour seul). */}
            <line x1="6" y1="9" x2="23" y2="16" stroke="#2b44cc" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="6" y1="23" x2="23" y2="16" stroke="#e2570f" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="6" cy="9" r="3.25" fill="#2b44cc" />
            <circle cx="6" cy="23" r="3.25" fill="#e2570f" />
            <circle cx="23" cy="16" r="4.5" fill="#14171c" />
          </svg>
          <span style={{ fontSize: 64, fontWeight: 600, color: "#14171c" }}>SmartCovoit</span>
        </div>
        <span style={{ marginTop: 36, fontSize: 34, color: "#5a6472", maxWidth: 920 }}>
          Organise les trajets d&apos;un groupe : qui prend qui, et dans quel ordre.
        </span>
      </div>
    ),
    { ...size },
  );
}
