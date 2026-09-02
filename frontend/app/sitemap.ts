import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Seule l'accueil est listée : les pages d'événements sont nominatives
 * (noms, adresses de particuliers) et ne circulent que par lien direct — les
 * lister ici les exposerait aux moteurs de recherche, cf. `robots: noindex`
 * sur events/[id]/page.tsx.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
