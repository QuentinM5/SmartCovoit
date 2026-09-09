import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";

/**
 * Icônes 192×192 et 512×512 pour le manifest (app/manifest.ts) : les
 * conventions `icon`/`apple-icon` de Next ne couvrent que le favicon et
 * l'icône iOS, pas les tailles attendues par Android pour "Ajouter à
 * l'écran d'accueil". Un seul gabarit, paramétré par la taille dans l'URL,
 * plutôt que deux fichiers identiques à maintenir en double.
 */
const VALID_SIZES = new Set(["192", "512"]);

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: sizeParam } = await params;
  if (!VALID_SIZES.has(sizeParam)) {
    return NextResponse.json({ detail: "Taille d'icône non prise en charge." }, { status: 404 });
  }
  const size = Number(sizeParam);
  const markSize = Math.round(size * 0.72);

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
        <svg width={markSize} height={markSize} viewBox="0 0 32 32" fill="none">
          {/* Cercles pleins : cf. app/icon.tsx pour pourquoi (limite de
              rendu de Satori sur un cercle en contour seul). */}
          <line x1="6" y1="9" x2="23" y2="16" stroke="#2b44cc" strokeWidth="3" strokeLinecap="round" />
          <line x1="6" y1="23" x2="23" y2="16" stroke="#e2570f" strokeWidth="3" strokeLinecap="round" />
          <circle cx="6" cy="9" r="3.5" fill="#2b44cc" />
          <circle cx="6" cy="23" r="3.5" fill="#e2570f" />
          <circle cx="23" cy="16" r="5" fill="#14171c" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
