"use client";

import { useState, type FormEvent } from "react";
import { Car, User } from "lucide-react";
import { AddressInput, needsSelection, type AddressValue } from "@/components/address-input";
import { DirectionCheckboxes } from "@/components/direction";
import { Button, ErrorNote, Field, inputClass } from "@/components/ui";
import { networkMessage } from "@/lib/event-format";
import type { Direction } from "@/lib/api";

export type Role = "driver" | "passenger";

/**
 * Le conducteur ne « se dépose » pas lui-même : son adresse est un point de
 * son propre trajet (départ ou retour), pas une dépose faite par quelqu'un
 * d'autre. Une personne inscrite aux deux sens à la fois donne une seule
 * adresse qui sert aux deux rôles.
 */
function addressCopy(role: Role, directions: Direction[]): { label: string; hint: string } {
  const wantsAller = directions.includes("ramassage");
  const wantsRetour = directions.includes("dispersion");

  if (wantsAller && wantsRetour) {
    return role === "driver"
      ? { label: "Ton adresse", hint: "D'où tu pars à l'aller, où tu rentres au retour." }
      : { label: "Ton adresse", hint: "Où on te prend à l'aller, où on te dépose au retour." };
  }
  if (wantsRetour) {
    return role === "driver"
      ? { label: "Adresse d'arrivée", hint: "Où tu rentres." }
      : { label: "Adresse d'arrivée", hint: "Où on te dépose." };
  }
  return role === "driver"
    ? { label: "Adresse de départ", hint: "D'où tu pars." }
    : { label: "Adresse de départ", hint: "D'où on te prend." };
}

export function SignupSection({
  defaultDirection,
  defaultName,
  onAdd,
}: {
  defaultDirection: Direction;
  /** Nom du compte connecté — préremplit le champ (modifiable, pour
   * inscrire quelqu'un d'autre) plutôt que de partir d'un champ vide à
   * chaque fois. */
  defaultName: string;
  onAdd: (
    role: Role,
    directions: Direction[],
    data: { name: string; seats: number; address: string; lat: number | null; lon: number | null },
  ) => Promise<void>;
}) {
  const [role, setRole] = useState<Role>("passenger");
  const [directions, setDirections] = useState<Direction[]>([defaultDirection]);
  const [name, setName] = useState(defaultName);
  const [seats, setSeats] = useState(3);
  const [address, setAddress] = useState<AddressValue>({ address: "", lat: null, lon: null });
  const [addressAvailable, setAddressAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { label: addressLabel, hint: addressHint } = addressCopy(role, directions);
  const addressIncomplete = needsSelection(address, addressAvailable);
  const canSubmit = !addressIncomplete && directions.length > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);

    const entry = { name, seats, address: address.address, lat: address.lat, lon: address.lon };
    // Le formulaire se vide tout de suite : la personne apparaît déjà dans
    // la liste « Inscrits » ci-dessous (mise à jour optimiste côté parent),
    // pas besoin d'attendre le serveur pour rendre la main. Le nom revient
    // au nom du compte connecté plutôt qu'un champ vide — le cas courant est
    // de s'inscrire soi-même, pas d'enchaîner les inscriptions pour d'autres.
    setName(defaultName);
    setAddress({ address: "", lat: null, lon: null });
    setSeats(3);

    try {
      await onAdd(role, directions, entry);
    } catch (err) {
      setError(
        networkMessage(err, "L'inscription n'a pas abouti. Vérifie l'adresse et réessaie."),
      );
    }
  }

  return (
    <section data-surface className="rounded-lg border border-line bg-surface p-4 sm:p-5">
      <h2 className="text-sm font-semibold tracking-tight">S&apos;inscrire</h2>

      <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-4">
        <fieldset>
          <legend className="sr-only">Je participe comme</legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { value: "passenger", label: "Passager", Icon: User },
                { value: "driver", label: "Conducteur", Icon: Car },
              ] as const
            ).map(({ value, label, Icon }) => {
              const selected = role === value;
              return (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-inbound ${
                    selected
                      ? "border-ink bg-ink text-paper"
                      : "border-line text-muted hover:border-muted"
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={value}
                    checked={selected}
                    onChange={() => setRole(value)}
                    className="sr-only"
                  />
                  <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
                  {label}
                </label>
              );
            })}
          </div>
        </fieldset>

        <DirectionCheckboxes value={directions} onChange={setDirections} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Prénom"
              className={inputClass}
            />
          </Field>

          {role === "driver" && (
            <Field label="Places passagers" hint="Sans compter la tienne.">
              <input
                required
                type="number"
                inputMode="numeric"
                min={1}
                max={20}
                value={seats}
                onChange={(e) => setSeats(Number(e.target.value))}
                className={`${inputClass} tabular font-mono`}
              />
            </Field>
          )}
        </div>

        <Field label={addressLabel} hint={addressHint}>
          <AddressInput
            required
            value={address}
            onChange={setAddress}
            onAvailabilityChange={setAddressAvailable}
            placeholder="Commence à taper une adresse…"
          />
        </Field>

        {error && <ErrorNote>{error}</ErrorNote>}

        <div>
          <Button type="submit" variant="quiet" disabled={!canSubmit}>
            M&apos;inscrire
          </Button>
        </div>
      </form>
    </section>
  );
}
