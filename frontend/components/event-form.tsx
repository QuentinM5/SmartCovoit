"use client";

import { useState, type FormEvent } from "react";
import { AddressInput, needsSelection, type AddressValue } from "@/components/address-input";
import { Button, ErrorNote, Field, inputClass } from "@/components/ui";
import { addCalendarDays } from "@/lib/event-schedule";
import { networkMessage } from "@/lib/event-format";

export interface EventFormValues {
  name: string;
  eventDate: string;
  arrivalTime: string;
  departureTime: string;
  endDate: string;
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
  initialEndDayOffset = 0,
  submitLabel,
  submittingLabel,
  onSubmit,
}: {
  initialValues?: Partial<EventFormValues>;
  initialEndDayOffset?: number;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (values: EventFormValues) => void | Promise<void>;
}) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [eventDate, setEventDate] = useState(initialValues?.eventDate ?? "");
  const [arrivalTime, setArrivalTime] = useState(initialValues?.arrivalTime?.slice(0, 5) ?? "");
  const [departureTime, setDepartureTime] = useState(initialValues?.departureTime?.slice(0, 5) ?? "");
  const [endDate, setEndDate] = useState(initialValues?.endDate ?? initialValues?.eventDate ?? "");
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
    if (depotIncomplete || !eventDate || !endDate || submitting) return;
    setError(null);
    if (endDate < eventDate || (endDate === eventDate && arrivalTime && departureTime && departureTime < arrivalTime)) {
      setError("La fin de l’événement ne peut pas précéder son début.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ name, eventDate, arrivalTime, departureTime, endDate, description, depot });
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

      <Field label="Date de début de l’événement">
        <input
          required
          type="date"
          value={eventDate}
          onChange={(e) => {
            const nextDate = e.target.value;
            if (endDate === eventDate) setEndDate(nextDate && !eventDate ? addCalendarDays(nextDate, initialEndDayOffset) : nextDate);
            else if (!endDate && nextDate) setEndDate(addCalendarDays(nextDate, initialEndDayOffset));
            setEventDate(nextDate);
          }}
          className={`${inputClass} tabular font-mono`}
        />
      </Field>

      <div className="flex flex-col gap-4">
        <Field label="Heure de début de l’événement — facultatif">
          <input type="time" value={arrivalTime} onChange={(e) => setArrivalTime(e.target.value)} className={`${inputClass} min-w-0 tabular font-mono`} />
        </Field>
        <Field label="Date de fin de l’événement">
          <input required type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={`${inputClass} min-w-0 tabular font-mono`} />
        </Field>
        <Field label="Heure de fin de l’événement — facultatif">
          <input type="time" value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} className={`${inputClass} min-w-0 tabular font-mono`} />
        </Field>
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
        <Button type="submit" disabled={depotIncomplete || !eventDate || !endDate || submitting}>
          {submitting ? submittingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
