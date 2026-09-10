"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import {
  addDriver,
  addPassenger,
  ApiError,
  createEvent,
  deleteEvent,
  getAccessRequests,
  getEvent,
  updateAccessRequest,
  updateEvent,
  type AccessMode,
  type AccessRequest,
  type EventDetail,
} from "@/lib/api";
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
              Changer l&apos;adresse de rendez-vous efface les trajets déjà calculés : ils partaient de
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

          <AccessSettingsForm
            eventId={id}
            event={event}
            onAccessModeChange={(mode) => setEvent((current) => (current ? { ...current, access_mode: mode } : current))}
          />

          {event.access_mode === "approval" && <AccessRequestsPanel eventId={id} />}

          <DuplicateSection event={event} />

          <DangerZone eventId={id} eventName={event.name} />
        </div>
      </main>
    </>
  );
}

/**
 * Duplique l'événement : pratique pour un organisateur récurrent (ex. un
 * tournoi tous les dimanches) qui veut relancer les mêmes paramètres sans
 * tout ressaisir. Purement frontend : réutilise `EventForm` (déjà partagé
 * avec la création) puis les mêmes appels que la création/l'inscription
 * classique — aucun endpoint dédié côté serveur.
 *
 * Ce qui est copié reste au choix de la personne qui duplique (cases à
 * cocher), plutôt qu'un comportement fixe : les tournées calculées
 * (`SolutionRecord`) ne sont elles jamais copiées, ça n'aurait pas de sens
 * sur une nouvelle date.
 */
function DuplicateSection({ event }: { event: EventDetail }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [copyCostSettings, setCopyCostSettings] = useState(true);
  const [copyParticipants, setCopyParticipants] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDuplicate(values: EventFormValues) {
    setError(null);
    setSubmitting(true);
    try {
      const newEventId = crypto.randomUUID();
      await createEvent({
        id: newEventId,
        name: values.name,
        depot_address: values.depot.address,
        event_date: values.eventDate,
        description: values.description.trim() || null,
        lat: values.depot.lat,
        lon: values.depot.lon,
      });

      if (copyCostSettings) {
        await updateEvent(newEventId, {
          fuel_price_per_l: event.fuel_price_per_l,
          consumption_l_per_100km: event.consumption_l_per_100km,
          currency: event.currency,
        });
      }

      if (copyParticipants) {
        // Coordonnées déjà connues (reprises telles quelles de l'événement
        // source) : pas de nouveau géocodage, ces appels n'attendent pas le
        // limiteur Nominatim — un Promise.all est donc sûr même pour un
        // gros événement.
        await Promise.all([
          ...event.drivers.map((d) =>
            addDriver(newEventId, {
              name: d.name,
              seats: d.seats,
              address: d.address,
              lat: d.lat,
              lon: d.lon,
              direction: d.direction,
            }),
          ),
          ...event.passengers.map((p) =>
            addPassenger(newEventId, {
              name: p.name,
              address: p.address,
              lat: p.lat,
              lon: p.lon,
              direction: p.direction,
            }),
          ),
        ]);
      }

      router.push(`/events/${newEventId}`);
      // Pas de setSubmitting(false) : la page se démonte au push, comme
      // EventForm le fait déjà pour la création/l'édition classique.
    } catch (err) {
      setError(networkMessage(err, "La duplication n'a pas abouti. Réessaie."));
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line p-4 sm:p-5">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">Dupliquer cet événement</h2>
        <p className="mt-1 text-xs text-muted">
          Relance les mêmes paramètres pour une nouvelle date, sans repartir de zéro.
        </p>
      </div>

      {open ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={copyCostSettings}
                onChange={(e) => setCopyCostSettings(e.target.checked)}
              />
              Copier le barème de frais et la devise
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={copyParticipants}
                onChange={(e) => setCopyParticipants(e.target.checked)}
              />
              Copier les inscrits ({event.drivers.length} conducteur
              {event.drivers.length > 1 ? "s" : ""}, {event.passengers.length} passager
              {event.passengers.length > 1 ? "s" : ""})
            </label>
          </div>

          <EventForm
            initialValues={{
              name: event.name,
              // Date volontairement vide : l'ancienne n'a pas de sens pour
              // le nouvel événement, `EventForm` bloque déjà l'envoi tant
              // qu'elle n'est pas resaisie.
              eventDate: "",
              description: event.description ?? "",
              depot: { address: event.depot_address, lat: event.depot_lat, lon: event.depot_lon },
            }}
            submitLabel="Créer la copie"
            submittingLabel="Duplication…"
            onSubmit={handleDuplicate}
          />

          {error && <ErrorNote>{error}</ErrorNote>}

          <div>
            <Button type="button" variant="quiet" onClick={() => setOpen(false)} disabled={submitting}>
              Annuler
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button type="button" variant="quiet" onClick={() => setOpen(true)}>
            Dupliquer l&apos;événement
          </Button>
        </div>
      )}
    </div>
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

/**
 * "open" (défaut) laisse le lien accessible à quiconque l'a — comportement
 * historique, inchangé. "approval" ferme l'événement le temps qu'un compte
 * approuvé soit choisi (cf. AccessRequestsPanel) — rien n'est visible entre
 * les deux, pas même le nom de l'événement (cf. RestrictedEventGate côté
 * page événement).
 */
function AccessSettingsForm({
  eventId,
  event,
  onAccessModeChange,
}: {
  eventId: string;
  event: EventDetail;
  onAccessModeChange: (mode: AccessMode) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(mode: AccessMode) {
    setSaving(true);
    setError(null);
    try {
      await updateEvent(eventId, { access_mode: mode });
      onAccessModeChange(mode);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "L'enregistrement n'a pas abouti. Réessaie.");
    } finally {
      setSaving(false);
    }
  }

  const OPTIONS: { value: AccessMode; label: string; help: string }[] = [
    { value: "open", label: "Toute personne avec le lien", help: "Comportement actuel — rien ne change." },
    {
      value: "approval",
      label: "Approbation requise",
      help: "Le lien seul ne suffit plus : il faut un compte connecté, approuvé par toi.",
    },
  ];

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line p-4 sm:p-5">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">Confidentialité</h2>
        <p className="mt-1 text-xs text-muted">Qui peut voir cet événement.</p>
      </div>
      <fieldset className="flex flex-col gap-2">
        {OPTIONS.map((option) => (
          <label key={option.value} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="access_mode"
              className="mt-0.5"
              checked={event.access_mode === option.value}
              disabled={saving}
              onChange={() => handleChange(option.value)}
            />
            <span>
              <span className="block font-medium">{option.label}</span>
              <span className="block text-xs text-muted">{option.help}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}

/**
 * Visible seulement quand `access_mode === "approval"` (cf. call site) :
 * charge la liste au montage, pas de rafraîchissement automatique — un
 * clic Approuver/Refuser retire la ligne de la liste locale directement
 * (mise à jour optimiste, même patron que roster-section.tsx).
 */
function AccessRequestsPanel({ eventId }: { eventId: string }) {
  const [requests, setRequests] = useState<AccessRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    getAccessRequests(eventId)
      .then(setRequests)
      .catch((err) => setError(networkMessage(err, "Impossible de charger les demandes d'accès.")));
  }, [eventId]);

  async function handleDecision(requestId: string, status: "approved" | "denied") {
    setBusyId(requestId);
    setError(null);
    try {
      const updated = await updateAccessRequest(eventId, requestId, status);
      setRequests((current) => current?.map((r) => (r.id === requestId ? updated : r)) ?? current);
    } catch (err) {
      setError(networkMessage(err, "L'action n'a pas abouti. Réessaie."));
    } finally {
      setBusyId(null);
    }
  }

  const pending = requests?.filter((r) => r.status === "pending") ?? [];

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line p-4 sm:p-5">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">Demandes d&apos;accès</h2>
        <p className="mt-1 text-xs text-muted">Approuve ou refuse qui peut voir cet événement.</p>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {requests === null ? (
        <p className="text-sm text-muted">Chargement…</p>
      ) : pending.length === 0 ? (
        <p className="text-sm text-muted">Aucune demande en attente.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {pending.map((request) => (
            <li
              key={request.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line px-3 py-2 text-sm"
            >
              <span>
                <span className="font-medium">{request.user_name}</span>{" "}
                <span className="text-muted">{request.user_email}</span>
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleDecision(request.id, "approved")}
                  disabled={busyId === request.id}
                  className="text-xs font-medium text-inbound underline underline-offset-2 disabled:opacity-45"
                >
                  Approuver
                </button>
                <button
                  type="button"
                  onClick={() => handleDecision(request.id, "denied")}
                  disabled={busyId === request.id}
                  className="text-xs font-medium text-danger underline underline-offset-2 disabled:opacity-45"
                >
                  Refuser
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
