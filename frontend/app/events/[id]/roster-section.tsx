"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Car, ChevronRight, Pencil, Upload, User, X } from "lucide-react";
import { AddressInput, needsSelection, type AddressValue } from "@/components/address-input";
import { DeleteButton } from "@/components/delete-button";
import { Button, ErrorNote, Field, inputClass } from "@/components/ui";
import type { Direction, Driver, Passenger } from "@/lib/api";
import { ImportDialog } from "./import-dialog";
import type { Role } from "./signup-section";

export interface ParticipantUpdate {
  name: string;
  seats?: number;
  address: string;
  lat: number | null;
  lon: number | null;
}

export function RosterSection({
  eventId,
  viewDirection,
  canImport,
  drivers,
  passengers,
  seatsLeft,
  error,
  onRemove,
  onUpdate,
  onImported,
}: {
  eventId: string;
  viewDirection: Direction;
  /** Importer en lot inscrit des tiers au nom du groupe entier : réservé à
   * l'organisateur, même garde que côté serveur (`_check_owner_or_open`). */
  canImport: boolean;
  drivers: Driver[];
  passengers: Passenger[];
  /** Négatif = surcapacité (plus de passagers que de places offertes). */
  seatsLeft: number;
  error: string | null;
  onRemove: (kind: Role, participantId: string) => void;
  onUpdate: (kind: Role, participantId: string, data: ParticipantUpdate) => Promise<void>;
  onImported: () => void;
}) {
  const [importing, setImporting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-lg font-semibold tracking-tight">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={contentId}
            onClick={() => setExpanded((value) => !value)}
            className="inline-flex cursor-pointer items-center gap-2 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
          >
            <ChevronRight
              className={`size-4 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
              strokeWidth={1.75}
              aria-hidden="true"
            />
            {viewDirection === "dispersion" ? "Inscrits au retour" : "Inscrits à l'aller"}
          </button>
        </h2>
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

      <div id={contentId} hidden={!expanded}>
      {canImport && (
        <button
          type="button"
          onClick={() => setImporting(true)}
          className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted transition hover:text-ink"
        >
          <Upload className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
          Importer depuis un fichier
        </button>
      )}

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
                    editable={d.can_edit}
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
                          <div className="min-w-0 flex-1">
                            <p className="font-medium [overflow-wrap:anywhere]">{d.name}</p>
                            <p className="truncate text-muted" title={d.address}>{d.address}</p>
                            <p className="tabular mt-1 font-mono text-xs text-muted">
                              {d.seats} {d.seats > 1 ? "places" : "place"}
                            </p>
                          </div>
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
                    editable={p.can_edit}
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
                          <div className="min-w-0 flex-1">
                            <p className="font-medium [overflow-wrap:anywhere]">{p.name}</p>
                            <p className="truncate text-muted" title={p.address}>{p.address}</p>
                          </div>
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
      </div>
      {importing && (
        <ImportDialog
          eventId={eventId}
          direction={viewDirection}
          onClose={() => setImporting(false)}
          onImported={onImported}
        />
      )}
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
    return <li className="min-w-0 rounded-md border border-line px-3 py-2.5 text-sm">{render(true, setEditing)}</li>;
  }

  return (
    <li className="flex min-w-0 items-start gap-2 rounded-md border border-line px-3 py-2.5 text-sm">
      {render(false, setEditing)}
      <div className="flex shrink-0 items-center gap-1">
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
      </div>
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
        <div className="grid min-w-0 flex-1 gap-3">
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
