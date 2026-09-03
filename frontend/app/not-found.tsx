import { ButtonLink, Header } from "@/components/ui";

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-3xl px-5 py-14 sm:py-20">
        <div className="max-w-lg">
          <p className="text-xs font-medium tracking-wide text-muted">404</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Cette page n&apos;existe pas.
          </h1>
          <p className="mt-3 text-muted">
            Le lien est peut-être mal copié, ou l&apos;événement n&apos;existe plus.
          </p>
          <ButtonLink href="/" className="mt-6">
            Retour à l&apos;accueil
          </ButtonLink>
        </div>
      </main>
    </>
  );
}
