"use client";

import { useState, type FormEvent } from "react";
import { AddressInput, needsSelection, type AddressValue } from "@/components/address-input";
import { Button, ErrorNote, Field, inputClass } from "@/components/ui";
import { networkMessage } from "@/lib/event-format";

export interface EventFormValues {
  name: string;
  eventDate: string;
  arrivalTime: string;
  departureTime: string;
  departureNextDay: boolean;
  description: string;
  depot: AddressValue;
}

/**
 * Champs partagés entre la création (app/page.tsx) et l'édition
 * (app/events/[id]/edit/page.tsx) d'un événement — volontairement sans la
 * logique de navigation optimiste de la création (seed + router.push avant
 * réponse serveur) : elle est spécifique à ce cas, le parent la garde.
 */
export function EventForm({
  initialValues,
  submitLabel,
  submittingLabel,
  onSubmit,
}: {
  initialValues?: Partial<EventFormValues>;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (values: EventFormValues) => void | Promise<void>;
}) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [eventDate, setEventDate] = useState(initialValues?.eventDate ?? "");
  const [arrivalTime, setArrivalTime] = useState(initialValues?.arrivalTime?.slice(0, 5) ?? "");
  const [departureTime, setDepartureTime] = useState(initialValues?.departureTime?.slice(0, 5) ?? "");
  const [departureNextDay, setDepartureNextDay] = useState(initialValues?.departureNextDay ?? false);
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [depot, setDepot] = useState<AddressValue>(
    initialValues?.depot ?? { address: "", lat: null, lon: null },
  );
  const [addressAvailable, setAddressAvailable] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const depotIncomplete = needsSelection(depot, addressAvailable);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (depotIncomplete || !eventDate || submitting) return;
    setError(null);
    if (arrivalTime && departureTime && !departureNextDay && departureTime < arrivalTime) {
      setError("Le départ pour la dispersion précède l’arrivée. Coche « Départ le lendemain » si nécessaire.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ name, eventDate, arrivalTime, departureTime, departureNextDay: !!departureTime && departureNextDay, description, depot });
      // Pas de `setSubmitting(false)` ici : un onSubmit réussi navigue
      // généralement ailleurs (création ou retour à la page événement) —
      // le remettre juste avant le démontage ne ferait que clignoter.
    } catch (err) {
      setError(networkMessage(err, "L'enregistrement n'a pas abouti. Réessaie."));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <Field label="Nom de l'événement">
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Sortie ski, tournoi, mariage…"
          className={inputClass}
        />
      </Field>

      <Field label="Date de l'événement">
        <input
          required
          type="date"
          value={eventDate}
          onChange={(e) => setEventDate(e.target.value)}
          className={`${inputClass} tabular font-mono`}
        />
      </Field>

      <div className="flex flex-col gap-4">
        <p className="text-xs text-muted">Horaires facultatifs, en heure locale du lieu de l’événement.</p>
        <Field label="Heure d’arrivée au rassemblement — facultatif">
          <input type="time" value={arrivalTime} onChange={(e) => setArrivalTime(e.target.value)} className={`${inputClass} min-w-0 tabular font-mono`} />
        </Field>
        <Field label="Heure de départ pour la dispersion — facultatif">
          <input type="time" value={departureTime} onChange={(e) => {
            setDepartureTime(e.target.value);
            if (!e.target.value) setDepartureNextDay(false);
          }} className={`${inputClass} min-w-0 tabular font-mono`} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={departureNextDay && !!departureTime} disabled={!departureTime} onChange={(e) => setDepartureNextDay(e.target.checked)} />
          Départ le lendemain
        </label>
      </div>

      <Field label="Adresse de l'événement" hint="Là où tout le monde se retrouve.">
        <AddressInput
          required
          value={depot}
          onChange={setDepot}
          onAvailabilityChange={setAddressAvailable}
          placeholder="Commence à taper une adresse…"
        />
      </Field>

      <Field
        label="Message pour le groupe"
        hint="Visible sur la page, par exemple les consignes de rendez-vous. Facultatif."
      >
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ex. : on se retrouve devant l'entrée principale, prévoir des chaussures de marche…"
          rows={3}
          maxLength={2000}
          className={`${inputClass} resize-y`}
        />
      </Field>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div>
        <Button type="submit" disabled={depotIncomplete || !eventDate || submitting}>
          {submitting ? submittingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
