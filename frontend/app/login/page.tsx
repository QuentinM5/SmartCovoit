import type { Metadata } from "next";
import { LoginPageClient } from "./login-client";

export const metadata: Metadata = {
  title: "Se connecter",
  description: "Connecte-toi à SmartCovoit pour créer un événement ou t'inscrire à un covoiturage.",
  alternates: { canonical: "/login" },
};

export default function LoginPage() {
  return <LoginPageClient />;
}
