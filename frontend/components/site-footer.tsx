import Link from "next/link";

const CONTACT_EMAIL = "snkbdn.de@gmail.com";

/**
 * Pied de page global, posé une fois dans app/layout.tsx plutôt que répété
 * par page : seul endroit du site qui porte l'adresse de contact et les
 * liens légaux (cf. audit finition, points 1, 2 et 4).
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-5 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>SmartCovoit</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/confidentialite" className="transition hover:text-ink">
            Confidentialité
          </Link>
          <Link href="/conditions" className="transition hover:text-ink">
            Conditions
          </Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="transition hover:text-ink">
            {CONTACT_EMAIL}
          </a>
        </div>
      </div>
    </footer>
  );
}
