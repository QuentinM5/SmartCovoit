import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/ui";

export const metadata: Metadata = {
  title: "Conditions d'utilisation",
  description: "Ce que tu peux attendre de SmartCovoit, et ce que le site attend de toi.",
  alternates: { canonical: "/conditions" },
};

const CONTACT_EMAIL = "snkbdn.de@gmail.com";

export default function TermsPage() {
  return (
    <>
      <Header back />
      <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:py-14">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Conditions d&apos;utilisation</h1>
        <p className="mt-2 text-sm text-muted">Dernière mise à jour : septembre 2026.</p>

        <div className="mt-8 flex flex-col gap-8 text-sm leading-relaxed text-muted">
          <section>
            <h2 className="text-base font-semibold text-ink">Ce que fait le site</h2>
            <p className="mt-2">
              SmartCovoit calcule qui prend qui, dans quel ordre, pour un groupe qui s&apos;organise en covoiturage
              autour d&apos;un événement commun. C&apos;est un outil d&apos;aide à la décision, pas une réservation
              ni un engagement entre les personnes inscrites : ce que chacun fait réellement le jour venu reste une
              affaire entre les membres du groupe.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Créer un compte</h2>
            <p className="mt-2">
              Un compte demande un email et un mot de passe, ou une connexion Google. Les informations données
              doivent être les tiennes : ne crée pas de compte au nom de quelqu&apos;un d&apos;autre, et n&apos;
              inscris pas une autre personne comme conductrice ou passagère sans qu&apos;elle le sache, puisque son
              nom et son adresse deviennent alors visibles sur la page de l&apos;événement.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Un usage raisonnable</h2>
            <p className="mt-2">
              Le calcul des trajets s&apos;appuie sur des services externes facturés à l&apos;usage. Des limites
              techniques (nombre de calculs par jour, délai entre deux calculs sur un même trajet) protègent le
              service contre un usage excessif, involontaire ou non. Contourner volontairement ces limites, ou
              utiliser le site pour autre chose que coordonner un vrai covoiturage, n&apos;est pas un usage prévu par
              ces conditions.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Précision des trajets calculés</h2>
            <p className="mt-2">
              Les distances et les tournées proposées viennent d&apos;un calcul automatique, à partir des adresses
              fournies et d&apos;un service de cartographie externe. Ce calcul peut se tromper, notamment si une
              adresse est mal saisie ou mal localisée. Vérifie toujours un trajet avant de t&apos;y fier vraiment,
              en particulier pour un long parcours ou un horaire serré.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Disponibilité du service</h2>
            <p className="mt-2">
              SmartCovoit est un projet développé et maintenu par une seule personne, sans garantie de disponibilité
              continue. Le service peut être interrompu, modifié, ou arrêté, avec ou sans préavis. Ce n&apos;est pas
              le bon outil pour une organisation qui a besoin d&apos;une garantie de service.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Supprimer un compte ou un événement</h2>
            <p className="mt-2">
              Un événement peut être supprimé par la personne qui l&apos;a créé, depuis sa page d&apos;édition ;
              cette suppression efface définitivement son contenu et les inscriptions qui s&apos;y rattachent,
              cf. la page{" "}
              <Link href="/confidentialite" className="text-ink underline underline-offset-2">
                confidentialité
              </Link>
              . Un compte peut être fermé sur simple demande par email.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Changements</h2>
            <p className="mt-2">
              Ces conditions peuvent évoluer avec le site. La date en haut de page indique la dernière modification.
              Une question sur un point précis peut être posée directement à{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-ink underline underline-offset-2">
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </section>
        </div>
      </main>
    </>
  );
}
