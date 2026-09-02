"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError, createEvent, type Direction } from "@/lib/api";
import { DirectionGlyph, DirectionPicker } from "@/components/direction";
import { AddressInput, needsSelection, type AddressValue } from "@/components/address-input";
import { Button, ErrorNote, Field, Header, inputClass } from "@/components/ui";

export default function HomePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  // La dispersion est le cas le plus courant : on repart d'un lieu commun, et
  // c'est le moment où personne n'a envie de s'organiser à la main.
  const [direction, setDirection] = useState<Direction>("dispersion");
  const [depot, setDepot] = useState<AddressValue>({ address: "", lat: null, lon: null });
  const [addressAvailable, setAddressAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const depotIncomplete = needsSelection(depot, addressAvailable);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // Filet de sécurité au cas où le formulaire serait soumis autrement que
    // par le bouton (Entrée dans un champ) : le bouton désactivé ne suffit
    // pas toujours à bloquer la soumission clavier.
    if (depotIncomplete) return;
    setError(null);
    // Bascule immédiate vers l'aperçu de l'événement, avant tout aller-retour
    // réseau : ce qu'on affiche existe déjà côté client (nom, sens, adresse),
    // pas besoin d'attendre le serveur pour donner un retour visuel.
    setCreating(true);
    try {
      const event = await createEvent({
        name,
        direction,
        depot_address: depot.address,
        lat: depot.lat,
        lon: depot.lon,
      });
      router.push(`/events/${event.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Impossible de joindre le service. Vérifie ta connexion et réessaie.",
      );
      setCreating(false);
    }
  }

  if (creating) {
    const dispersion = direction === "dispersion";
    return (
      <>
        <Header />
        <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:py-14">
          <div className="mx-auto max-w-lg">
            <div className="flex items-start gap-4">
              <DirectionGlyph
                direction={direction}
                animated
                className={`mt-1 h-10 w-14 shrink-0 animate-pulse ${dispersion ? "text-outbound" : "text-inbound"}`}
              />
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{name}</h1>
                <p className="mt-1 text-sm text-muted">
                  {dispersion ? "Dispersion depuis" : "Ramassage vers"}{" "}
                  <span className="text-ink">{depot.address}</span>
                </p>
              </div>
            </div>
            <p className="mt-8 flex items-center gap-2 text-sm text-muted">
              <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden="true" />
              Création de l&apos;événement…
            </p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />

      <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:py-14">
        <div className="mx-auto max-w-lg">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Qui prend qui, et dans quel ordre.
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            Crée l&apos;événement, partage le lien. Chacun s&apos;inscrit avec son adresse, et les
            tournées se calculent toutes seules — au plus court pour l&apos;ensemble du groupe.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mx-auto mt-10 flex max-w-lg flex-col gap-6">
          <Field label="Nom de l'événement">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sortie ski, tournoi, mariage…"
              className={inputClass}
            />
          </Field>

          <DirectionPicker value={direction} onChange={setDirection} />

          <Field
            label="Point de rendez-vous"
            hint={
              direction === "dispersion"
                ? "L'adresse d'où tout le monde repart."
                : "L'adresse où tout le monde se retrouve."
            }
          >
            <AddressInput
              required
              value={depot}
              onChange={setDepot}
              onAvailabilityChange={setAddressAvailable}
              placeholder="Commence à taper une adresse…"
            />
          </Field>

          {error && <ErrorNote>{error}</ErrorNote>}

          <div>
            <Button type="submit" disabled={depotIncomplete}>
              Créer l&apos;événement
            </Button>
          </div>
        </form>
      </main>
    </>
  );
}
