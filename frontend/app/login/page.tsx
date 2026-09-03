"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { Button, ErrorNote, Field, Header, inputClass } from "@/components/ui";
import { login as apiLogin, loginWithGoogle } from "@/lib/api";
import { networkMessage } from "@/lib/event-format";

function LoginForm() {
  const router = useRouter();
  const { login } = useAuth();
  // Page d'où venait le clic sur "Se connecter" (cf. Header) — y revenir
  // après connexion plutôt que de toujours renvoyer à l'accueil.
  const next = useSearchParams().get("next") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await apiLogin({ email, password });
      login(result);
      router.push(next);
    } catch (err) {
      setError(networkMessage(err, "La connexion n'a pas abouti. Réessaie."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleToken(idToken: string) {
    setError(null);
    try {
      const result = await loginWithGoogle(idToken);
      login(result);
      router.push(next);
    } catch (err) {
      setError(networkMessage(err, "La connexion Google n'a pas abouti. Réessaie."));
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:py-14">
      <div className="mx-auto flex max-w-sm flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Se connecter</h1>
          <p className="mt-1 text-sm text-muted">
            Pas encore de compte ?{" "}
            <Link href="/signup" className="text-ink underline underline-offset-2">
              Crée-en un
            </Link>
            .
          </p>
        </div>

        <GoogleSignInButton onIdToken={handleGoogleToken} />

        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-line" />
          ou
          <span className="h-px flex-1 bg-line" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Email">
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              autoComplete="email"
            />
          </Field>
          <Field label="Mot de passe">
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              autoComplete="current-password"
            />
          </Field>
          {error && <ErrorNote>{error}</ErrorNote>}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Connexion…" : "Se connecter"}
          </Button>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <>
      <Header back />
      {/* useSearchParams exige un Suspense au-dessus en rendu statique. */}
      <Suspense>
        <LoginForm />
      </Suspense>
    </>
  );
}
