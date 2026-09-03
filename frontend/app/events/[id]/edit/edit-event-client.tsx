"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { ApiError, deleteEvent, getEvent, updateEvent, type EventDetail } from "@/lib/api";
import { EventForm, type EventFormValues } from "@/components/event-form";
import { CURRENCIES, DEFAULT_CONSUMPTION_L_PER_100KM, DEFAULT_CURRENCY, DEFAULT_FUEL_PRICE_PER_L } from "@/lib/cost";
import { Button, ErrorNote, Field, Header, inputClass } from "@/components/ui";
import { networkMessage } from "@/lib/event-format";
import { LoginPrompt } from "../event-notices";

export function EditEventClient({ id }: { id: string }) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    getEvent(id)
      .then(setEvent)
      .catch((err) => setLoadError(networkMessage(err, "Impossible de charger cet événement.")));
  }, [id]);

  async function handleSubmit(values: EventFormValues) {
    await updateEvent(id, {
      name: values.name,
      depot_address: values.depot.address,
      event_date: values.eventDate,
      description: values.description.trim() || null,
      lat: values.depot.lat,
      lon: values.depot.lon,
    });
    router.push(`/events/${id}`);
  }

  if (authLoading || (!loadError && !event)) {
    return (
      <>
        <Header back />
        <main className="mx-auto w-full max-w-3xl px-5 py-14 text-sm text-muted">Chargement…</main>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <Header back />
        <main className="mx-auto w-full max-w-3xl px-5 py-14">
          <LoginPrompt message="Connecte-toi pour modifier cet événement." />
        </main>
      </>
    );
  }

  if (loadError || !event) {
    return (
      <>
        <Header back />
        <main className="mx-auto w-full max-w-3xl px-5 py-14">
          <ErrorNote>{loadError}</ErrorNote>
        </main>
      </>
    );
  }

  const canManage = event.owner_id === null || event.owner_id === user.id;
  if (!canManage) {
    return (
      <>
        <Header back />
        <main className="mx-auto w-full max-w-3xl px-5 py-14 text-sm text-muted">
          Seul l&apos;organisateur peut modifier cet événement.
        </main>
      </>
    );
  }

  return (
    <>
      <Header back />
      <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:py-14">
        <div className="mx-auto flex max-w-lg flex-col gap-10">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Modifier l&apos;événement</h1>
            <p className="mt-2 text-sm text-muted">
              Changer l&apos;adresse de rendez-vous efface les trajets déjà calculés — ils partaient de
              l&apos;ancien point.
            </p>
          </div>

          <EventForm
            initialValues={{
              name: event.name,
              eventDate: event.event_date,
              description: event.description ?? "",
              depot: { address: event.depot_address, lat: event.depot_lat, lon: event.depot_lon },
            }}
            submitLabel="Enregistrer"
            submittingLabel="Enregistrement…"
            onSubmit={handleSubmit}
          />

          <CostSettingsForm eventId={id} event={event} />

          <DangerZone eventId={id} eventName={event.name} />
        </div>
      </main>
    </>
  );
}

/**
 * Suppression de l'événement — irréversible pour tout le groupe (inscrits,
 * tournées calculées), donc une confirmation plus stricte que le `DeleteButton`
 * habituel : retaper le nom, pas juste cliquer une deuxième fois.
 */
function DangerZone({ eventId, eventName }: { eventId: string; eventName: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await deleteEvent(eventId);
      router.replace("/events");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "La suppression n'a pas abouti. Réessaie.");
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-danger/40 p-4 sm:p-5">
      <div>
        <h2 className="text-sm font-semibold tracking-tight text-danger">Supprimer l&apos;événement</h2>
        <p className="mt-1 text-xs text-muted">
          Efface définitivement les inscriptions et les trajets calculés. Aucun retour en arrière possible.
        </p>
      </div>

      {confirming ? (
        <div className="flex flex-col gap-2">
          <Field label={`Retape « ${eventName} » pour confirmer`}>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} className={inputClass} />
          </Field>
          {error && <ErrorNote>{error}</ErrorNote>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={typed !== eventName || deleting}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-danger px-4 py-2 text-sm font-medium text-paper transition hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {deleting ? "Suppression…" : "Supprimer définitivement"}
            </button>
            <Button type="button" variant="quiet" onClick={() => setConfirming(false)}>
              Annuler
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-danger/40 bg-surface px-4 py-2 text-sm font-medium text-danger transition hover:border-danger"
          >
            Supprimer l&apos;événement
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Barème du partage de frais, à part du formulaire principal : ce sont des
 * molettes de réglage secondaires, pas des informations d'événement — les
 * regrouper au même bouton "Enregistrer" aurait mélangé deux intentions
 * différentes pour qui ne modifie qu'un des deux.
 */
function CostSettingsForm({ eventId, event }: { eventId: string; event: EventDetail }) {
  const [fuelPrice, setFuelPrice] = useState(String(event.fuel_price_per_l ?? DEFAULT_FUEL_PRICE_PER_L));
  const [consumption, setConsumption] = useState(
    String(event.consumption_l_per_100km ?? DEFAULT_CONSUMPTION_L_PER_100KM),
  );
  const [currency, setCurrency] = useState(event.currency ?? DEFAULT_CURRENCY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateEvent(eventId, {
        fuel_price_per_l: Number(fuelPrice) || null,
        consumption_l_per_100km: Number(consumption) || null,
        currency,
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "L'enregistrement n'a pas abouti. Réessaie.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-surface
      className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 sm:p-5"
    >
      <div>
        <h2 className="text-sm font-semibold tracking-tight">Partage des frais</h2>
        <p className="mt-1 text-xs text-muted">
          Sert à estimer le coût de chaque tournée, réparti entre le conducteur et ses passagers.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Prix du carburant" hint={`${currency} par litre`}>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.01}
            value={fuelPrice}
            onChange={(e) => setFuelPrice(e.target.value)}
            className={`${inputClass} tabular font-mono`}
          />
        </Field>
        <Field label="Consommation" hint="L / 100 km">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.1}
            value={consumption}
            onChange={(e) => setConsumption(e.target.value)}
            className={`${inputClass} tabular font-mono`}
          />
        </Field>
        <Field label="Devise">
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputClass}>
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
      {saved && !error && <p className="text-sm text-muted">Enregistré.</p>}

      <div>
        <Button type="submit" variant="quiet" disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer le barème"}
        </Button>
      </div>
    </form>
  );
}
