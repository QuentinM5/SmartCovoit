import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

// Ne passe jamais par le build Next (Tailwind v4, PostCSS, OpenNext sont
// hors sujet ici) : seules les fonctions pures de lib/ et les composants
// client se testent, jamais un Server Component ni l'App Router. Par
// défaut en environnement "node" ; un fichier qui a besoin du DOM le
// déclare lui-même via une docblock `/** @vitest-environment jsdom */` en
// tête — une seule config, pas de projects/workspace à maintenir.
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "node",
    include: ["**/*.test.ts?(x)"],
    exclude: ["node_modules/**", ".next/**", ".open-next/**"],
  },
});
