import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  title: "SmartCovoit",
  description: "Organise les trajets d'un groupe : qui prend qui, et dans quel ordre.",
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${plexSans.variable} ${plexMono.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full font-sans antialiased">{children}</body>
    </html>
  );
}
