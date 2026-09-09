import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/ui";

export const metadata: Metadata = {
  title: "Confidentialité",
  description: "Quelles données SmartCovoit collecte, pourquoi, et comment les faire supprimer.",
  alternates: { canonical: "/confidentialite" },
};

const CONTACT_EMAIL = "snkbdn.de@gmail.com";

export default function PrivacyPage() {
  return (
    <>
      <Header back />
      <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:py-14">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Confidentialité</h1>
        <p className="mt-2 text-sm text-muted">Dernière mise à jour : septembre 2026.</p>

        <div className="mt-8 flex flex-col gap-8 text-sm leading-relaxed text-muted">
          <section>
            <h2 className="text-base font-semibold text-ink">Qui exploite ce site</h2>
            <p className="mt-2">
              SmartCovoit est développé et exploité par une personne physique, sans structure d&apos;entreprise
              déclarée. Pour toute question sur tes données ou pour exercer l&apos;un des droits décrits plus bas,
              écris à{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-ink underline underline-offset-2">
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Ce que le site enregistre</h2>
            <p className="mt-2">
              Créer un compte enregistre ton email, ton prénom, et soit un mot de passe (jamais en clair, uniquement
              son empreinte bcrypt), soit un identifiant Google si tu te connectes par ce biais. Créer un événement
              enregistre son nom, sa date, l&apos;adresse du point de rendez-vous et, si tu en ajoutes une, une image
              de couverture. T&apos;inscrire comme conducteur ou passager enregistre ton nom et ton adresse
              personnelle, géocodée en coordonnées précises pour que le calcul des trajets fonctionne. Rien de tout
              ça n&apos;est utilisé à d&apos;autres fins que faire tourner le site.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Qui peut voir quoi</h2>
            <p className="mt-2">
              La page d&apos;un événement est accessible à quiconque possède son lien, sans avoir besoin de créer un
              compte : c&apos;est ce qui permet de la partager facilement à un groupe. Concrètement, cela veut dire
              que les noms et les adresses des inscrits sont visibles par toute personne à qui ce lien est transmis,
              y compris au-delà du groupe d&apos;origine si le lien circule plus loin que prévu. Réfléchis-y avant
              de partager le lien d&apos;un événement en dehors du groupe concerné, et avant d&apos;y inscrire
              quelqu&apos;un d&apos;autre que toi.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Les services externes utilisés</h2>
            <p className="mt-2">
              Le calcul des trajets et l&apos;affichage des cartes passent par Google Maps, qui reçoit les adresses
              et coordonnées nécessaires à ce calcul. La connexion par Google, quand tu l&apos;utilises, passe par
              les services d&apos;identité de Google. Le site est hébergé sur Cloudflare et sa base de données chez
              Neon, deux prestataires techniques qui n&apos;ont pas d&apos;autre usage de tes données que de les
              stocker et les transmettre. Aucune de ces données n&apos;est vendue, ni partagée à des fins
              publicitaires.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Mesure d&apos;audience et cookies</h2>
            <p className="mt-2">
              Le site utilise PostHog pour compter les visites et comprendre quelles pages sont utiles. Tant que tu
              n&apos;as pas répondu au bandeau proposé à ta première visite, seules des pages vues anonymes sont
              comptées, sans cookie ni identifiant qui te suivrait d&apos;une visite à l&apos;autre. Si tu acceptes,
              un identifiant est posé pour reconnaître tes visites suivantes et, si tu es connecté, les relier à ton
              compte. Si tu refuses, aucune mesure n&apos;est faite du tout. Ce choix reste modifiable à tout moment
              en vidant les données de ce site dans ton navigateur, ce qui fait réapparaître le bandeau.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Combien de temps c&apos;est gardé</h2>
            <p className="mt-2">
              Un compte et ses événements sont gardés tant que tu ne demandes pas leur suppression. Supprimer un
              événement depuis sa page d&apos;édition efface définitivement son nom, son adresse, son image, et
              toutes les inscriptions qui s&apos;y rattachent. Le journal technique du site (qui a fait quoi, sans
              texte lisible) garde une trace anonymisée de l&apos;identifiant de l&apos;événement même après sa
              suppression, uniquement pour des statistiques d&apos;usage global.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Tes droits</h2>
            <p className="mt-2">
              Tu peux demander à voir, corriger, ou faire supprimer tes données à tout moment, par email à
              l&apos;adresse ci-dessus. Un compte et ses événements peuvent aussi être supprimés directement depuis
              le site, sans avoir à le demander. Si tu es dans l&apos;Union européenne, le règlement général sur la
              protection des données (RGPD) s&apos;applique à ce traitement ; si tu es au Québec, c&apos;est la Loi
              25 qui s&apos;applique. Dans les deux cas, les droits décrits ici sont ceux que ces textes garantissent.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Sécurité</h2>
            <p className="mt-2">
              Les mots de passe sont hachés, jamais stockés en clair. Les connexions au site sont chiffrées. Les
              tentatives de connexion répétées sur un même compte sont bloquées temporairement. Ces mesures réduisent
              le risque, elles ne l&apos;annulent pas : traite ton mot de passe comme n&apos;importe quel autre mot
              de passe sensible.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">Changements</h2>
            <p className="mt-2">
              Cette page peut être mise à jour si le fonctionnement du site change. La date en haut de page indique
              la dernière modification.
            </p>
          </section>
        </div>

        <p className="mt-10 text-sm text-muted">
          Voir aussi les{" "}
          <Link href="/conditions" className="text-ink underline underline-offset-2">
            conditions d&apos;utilisation
          </Link>
          .
        </p>
      </main>
    </>
  );
}
