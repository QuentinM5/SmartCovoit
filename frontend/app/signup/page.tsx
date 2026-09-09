import type { Metadata } from "next";
import { SignupPageClient } from "./signup-client";

export const metadata: Metadata = {
  title: "Créer un compte",
  description: "Crée un compte SmartCovoit pour organiser ou rejoindre un covoiturage de groupe.",
  alternates: { canonical: "/signup" },
};

export default function SignupPage() {
  return <SignupPageClient />;
}
