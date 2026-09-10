import type { Metadata } from "next";
import { headers } from "next/headers";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { AuthProvider } from "@/components/auth-provider";
import { CookieBanner } from "@/components/cookie-banner";
import { SiteFooter } from "@/components/site-footer";
import { TelemetryProvider } from "@/components/telemetry-provider";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// Le mono ne sert pas de décor : distances, places et numéros d'arrêt sont des
// données qui doivent s'aligner en colonne d'une ligne à l'autre.
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const DESCRIPTION = "Organise les trajets d'un groupe : qui prend qui, et dans quel ordre.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Chaque page d'événement pose son propre titre (cf. events/[id]/page.tsx) ;
  // le modèle évite que toutes les pages partagent le même <title>.
  title: { default: "SmartCovoit", template: "%s · SmartCovoit" },
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/` },
  openGraph: {
    title: "SmartCovoit",
    description: DESCRIPTION,
    siteName: "SmartCovoit",
    locale: "fr_CA",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "SmartCovoit",
    description: DESCRIPTION,
  },
};

// Type d'application réel, pas un `LocalBusiness` inventé (SmartCovoit n'a
// ni local, ni horaires, ni zone de service à déclarer) : c'est le schéma
// correct pour un service web sans présence physique, et il ne prétend rien
// que le site ne fasse pas vraiment.
const structuredData = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "SmartCovoit",
  description: DESCRIPTION,
  url: SITE_URL,
  applicationCategory: "TravelApplication",
  operatingSystem: "Any (navigateur web)",
  offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
};

// Appliqué avant le premier rendu pour qu'un rechargement en mode sombre ne
// flashe pas en blanc.
const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem("smartcovoit-theme");
    var dark = stored ? stored === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Posé par middleware.ts (un par requête) : sans lui, la CSP bloquerait ce
  // script comme n'importe quel autre inline non listé explicitement.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="fr" className={`${plexSans.variable} ${plexMono.variable} h-full`} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script
          nonce={nonce}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <TelemetryProvider />
        {/* flex-1 absorbe l'espace restant : pousse SiteFooter en bas de
            l'écran sur une page courte, sans l'empêcher de suivre le flux
            normal sous un contenu plus long que la fenêtre. */}
        <div className="flex-1">
          <AuthProvider>{children}</AuthProvider>
        </div>
        <SiteFooter />
        <CookieBanner />
      </body>
    </html>
  );
}
