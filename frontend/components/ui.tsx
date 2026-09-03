"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import { ThemeToggle } from "@/components/theme-toggle";

export function Header({ back = false }: { back?: boolean }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();

  return (
    <header className="border-b border-line">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-5 py-4">
        <Link href="/" className="flex items-baseline gap-2 transition hover:opacity-70">
          <span className="text-[15px] font-semibold tracking-tight">SmartCovoit</span>
          {back && <span className="text-sm text-muted">Retour</span>}
        </Link>
        <div className="flex items-center gap-3">
          {/* Pendant l'hydratation du jeton stocké, rien n'est affiché plutôt
              qu'un flash "Se connecter" qui disparaîtrait aussitôt si un
              compte est en fait déjà connecté. */}
          {!loading &&
            (user ? (
              <div className="flex items-center gap-3 text-sm">
                <Link href="/events" className="text-muted transition hover:text-ink">
                  Mes événements
                </Link>
                <span className="hidden text-muted sm:inline">{user.name}</span>
                <button
                  type="button"
                  onClick={logout}
                  className="cursor-pointer text-muted underline-offset-2 transition hover:text-ink hover:underline"
                >
                  Se déconnecter
                </button>
              </div>
            ) : (
              <Link
                href={`/login?next=${encodeURIComponent(pathname)}`}
                className="text-sm font-medium text-muted transition hover:text-ink"
              >
                Se connecter
              </Link>
            ))}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

export const inputClass =
  "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm placeholder:text-muted/70 transition focus:border-ink focus:outline-none";

export function Button({
  children,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "quiet" }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-45";
  const styles =
    variant === "primary"
      ? "bg-ink text-paper hover:opacity-85"
      : "border border-line bg-surface hover:border-ink";

  return (
    <button className={`${base} ${styles}`} {...props}>
      {children}
    </button>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-sm text-danger">
      {children}
    </p>
  );
}

/** Lien stylé comme un `<Button>`, jamais un `<Button>` imbriqué dans un
 * `<Link>` — un `<button>` dans un `<a>` est du HTML invalide. Factorisé ici
 * car dupliqué à l'identique dans plusieurs pages (accueil, 404, invite de
 * connexion sur la page événement). */
export function ButtonLink({
  href,
  children,
  variant = "primary",
  className = "",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "quiet";
  className?: string;
}) {
  const base = "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition";
  const styles =
    variant === "primary" ? "bg-ink text-paper hover:opacity-85" : "border border-line bg-surface hover:border-ink";

  return (
    <Link href={href} className={`${base} ${styles} ${className}`}>
      {children}
    </Link>
  );
}
