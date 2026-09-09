import type { Metadata } from "next";
import { MyEventsPageClient } from "./my-events-client";

export const metadata: Metadata = {
  title: "Mes événements",
  description: "Retrouve les événements de covoiturage que tu as créés ou auxquels tu es inscrit.",
  alternates: { canonical: "/events" },
  // Liste personnelle, propre au compte connecté — pas une page à indexer,
  // même raisonnement que le `noindex` des pages d'événement (cf. events/[id]/page.tsx).
  robots: { index: false, follow: false },
};

export default function MyEventsPage() {
  return <MyEventsPageClient />;
}
