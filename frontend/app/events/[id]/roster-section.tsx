"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Car, Pencil, User, X } from "lucide-react";
import { AddressInput, needsSelection, type AddressValue } from "@/components/address-input";
import { DeleteButton } from "@/components/delete-button";
import { Button, ErrorNote, Field, inputClass } from "@/components/ui";
import type { Driver, Passenger } from "@/lib/api";
import type { Role } from "./signup-section";

export interface ParticipantUpdate {
  name: string;
  seats?: number;
  address: string;
  lat: number | null;
  lon: number | null;
}

export function RosterSection({
  drivers,
  passengers,
  seatsLeft,
  error,
  canEdit,
  onRemove,
  onUpdate,
}: {
  drivers: Driver[];
  passengers: Passenger[];
  /** Négatif = surcapacité (plus de passagers que de places offertes). */
  seatsLeft: number;
  error: string | null;
  /** Cf. `_can_remove_participant` côté backend : la personne elle-même, une
   * inscription orpheline, ou l'organisateur — même règle pour modifier que
   * pour retirer, qui peut faire l'un peut faire l'autre. */
  canEdit: (participantUserId: string | null) => boolean;
  onRemove: (kind: Role, participantId: string) => void;
  onUpdate: (kind: Role, participantId: string, data: ParticipantUpdate) => Promise<void>;
}) {
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-semibold tracking-tight">Inscrits</h2>
        <p className="tabular text-sm text-muted">
          {drivers.length} {drivers.length > 1 ? "conducteurs" : "conducteur"}
          <span aria-hidden="true"> · </span>
          {passengers.length} {passengers.length > 1 ? "passagers" : "passager"}
          {drivers.length > 0 && (
            <>
              <span aria-hidden="true"> · </span>
              <span className={seatsLeft < 0 ? "text-danger" : ""}>
                {seatsLeft < 0
                  ? `${-seatsLeft} de trop`
                  : `${seatsLeft} ${seatsLeft > 1 ? "places libres" : "place libre"}`}
              </span>
            </>
          )}
        </p>
      </div>

      {drivers.length === 0 && passengers.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          Personne pour l&apos;instant sur ce trajet. Partage l&apos;adresse de cette page au groupe.
        </p>
      ) : (
        <>
          {drivers.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium tracking-wide text-muted">
                Conducteurs · {drivers.length}
              </p>
              <ul className="mt-1.5 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {drivers.map((d) => (
                  <RosterRow
                    key={d.id}
                    editable={canEdit(d.user_id)}
                    onRemove={() => onRemove("driver", d.id)}
                    render={(editing, startEdit) =>
                      editing ? (
                        <EditForm
                          role="driver"
                          initial={{ name: d.name, seats: d.seats, address: d.address, lat: d.lat, lon: d.lon }}
                          onCancel={() => startEdit(false)}
                          onSave={async (data) => {
                            await onUpdate("driver", d.id, data);
                            startEdit(false);
                          }}
                        />
                      ) : (
                        <>
                          <Car className="size-4 shrink-0 translate-y-0.5 text-muted" strokeWidth={1.75} />
                          <span className="font-medium">{d.name}</span>
                          <span className="min-w-0 flex-1 truncate text-muted">{d.address}</span>
                          <span className="tabular shrink-0 font-mono text-xs text-muted">
                            {d.seats} {d.seats > 1 ? "places" : "place"}
                          </span>
                        </>
                      )
                    }
                    name={d.name}
                  />
                ))}
              </ul>
            </div>
          )}

          {passengers.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium tracking-wide text-muted">
                Passagers · {passengers.length}
              </p>
              <ul className="mt-1.5 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {passengers.map((p) => (
                  <RosterRow
                    key={p.id}
                    editable={canEdit(p.user_id)}
                    onRemove={() => onRemove("passenger", p.id)}
                    render={(editing, startEdit) =>
                      editing ? (
                        <EditForm
                          role="passenger"
                          initial={{ name: p.name, address: p.address, lat: p.lat, lon: p.lon }}
                          onCancel={() => startEdit(false)}
                          onSave={async (data) => {
                            await onUpdate("passenger", p.id, data);
                            startEdit(false);
                          }}
                        />
                      ) : (
                        <>
                          <User className="size-4 shrink-0 translate-y-0.5 text-muted" strokeWidth={1.75} />
                          <span className="font-medium">{p.name}</span>
                          <span className="min-w-0 flex-1 truncate text-muted">{p.address}</span>
                        </>
                      )
                    }
                    name={p.name}
                  />
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
    </section>
  );
}

/**
 * Une ligne d'inscrit, capable de basculer en formulaire d'édition sur
 * place — `render` reçoit l'état d'édition plutôt que de dupliquer la
 * structure de liste (bordure, espacement) entre les deux rôles.
 */
function RosterRow({
  name,
  editable,
  onRemove,
  render,
}: {
  name: string;
  editable: boolean;
  onRemove: () => void;
  render: (editing: boolean, setEditing: (next: boolean) => void) => ReactNode;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return <li className="rounded-md border border-line px-3 py-2.5 text-sm">{render(true, setEditing)}</li>;
  }

  return (
    <li className="flex items-baseline gap-3 rounded-md border border-line px-3 py-2.5 text-sm">
      {render(false, setEditing)}
      {editable && (
        <button
          type="button"
          aria-label={`Modifier ${name}`}
          onClick={() => setEditing(true)}
          className="shrink-0 rounded p-1 text-muted transition hover:text-ink"
        >
          <Pencil className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
        </button>
      )}
      <DeleteButton label={name} onConfirm={onRemove} />
    </li>
  );
}

function EditForm({
  role,
  initial,
  onCancel,
  onSave,
}: {
  role: Role;
  initial: { name: string; seats?: number; address: string; lat: number; lon: number };
  onCancel: () => void;
  onSave: (data: ParticipantUpdate) => Promise<void>;
}) {
  const [name, setName] = useState(initial.name);
  const [seats, setSeats] = useState(initial.seats ?? 1);
  const [address, setAddress] = useState<AddressValue>({
    address: initial.address,
    lat: initial.lat,
    lon: initial.lon,
  });
  const [addressAvailable, setAddressAvailable] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // L'adresse d'origine n'a pas besoin d'être re-choisie dans la liste tant
  // qu'elle n'est pas modifiée : seule une frappe efface lat/lon (cf.
  // AddressInput), auquel cas la contrainte de sélection s'applique de
  // nouveau normalement.
  const addressIncomplete = address.address !== initial.address && needsSelection(address, addressAvailable);
  const canSubmit = name.trim().length > 0 && address.address.trim().length > 0 && !addressIncomplete;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name,
        seats: role === "driver" ? seats : undefined,
        address: address.address,
        lat: address.lat,
        lon: address.lon,
      });
    } catch {
      setError("L'enregistrement n'a pas abouti. Réessaie.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <Field label="Nom">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </Field>
          {role === "driver" && (
            <Field label="Places passagers">
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
        <button
          type="button"
          aria-label="Annuler la modification"
          onClick={onCancel}
          className="shrink-0 rounded p-1 text-muted transition hover:text-ink"
        >
          <X className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      <Field label="Adresse">
        <AddressInput value={address} onChange={setAddress} onAvailabilityChange={setAddressAvailable} />
      </Field>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="flex gap-2">
        <Button type="submit" variant="quiet" disabled={!canSubmit || saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </form>
  );
}
