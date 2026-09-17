"use client";

import { CalendarDays, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { CopyLinkButton } from "@/components/copy-link-button";
import { CoverImage } from "@/components/cover-image";
import { DownloadIcsButton } from "@/components/download-ics-button";
import { LocationMap } from "@/components/location-map";
import { QrCodeButton } from "@/components/qr-code-button";
import { ErrorNote } from "@/components/ui";
import { type EventDetail } from "@/lib/api";
import { formatEventDate } from "@/lib/event-format";
import { eventEndDate, eventScheduleLines } from "@/lib/event-schedule";

/**
 * Formulation neutre : tout ce qui est au-dessus de la barre de sens doit
 * rester vrai quel que soit l'onglet, sinon on recrée l'ambiguïté qu'elle
 * est censée lever.
 */
export function EventHeader({
  event,
  canManage,
  uploadingCoverImage,
  deletingCoverImage,
  coverImageError,
  coverImageRevision = 0,
  onUploadCoverImage,
  onDeleteCoverImage,
}: {
  event: EventDetail;
  /** Changer l'image de couverture est réservé à l'organisateur — sauf pour
   * un événement créé avant l'authentification (owner_id nul), resté ouvert
   * à tout compte connecté, cf. matrice d'autorisation côté backend. */
  canManage: boolean;
  uploadingCoverImage: boolean;
  deletingCoverImage: boolean;
  coverImageError: string | null;
  coverImageRevision?: number;
  onUploadCoverImage: (file: File) => void;
  onDeleteCoverImage: () => void;
}) {
  return (
    <section>
      {/* Titre d'abord dans le DOM, visuels ensuite : sur mobile (colonne)
          ça place naturellement l'image et la mini-carte sous le titre ;
          à partir de `sm:` (ligne), le titre se retrouve à gauche et les
          visuels à droite — sans dupliquer le balisage pour chaque taille. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-6">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl leading-[1.1] font-semibold tracking-tight sm:text-4xl lg:text-5xl">
            {event.name}
          </h1>
          {/* Date et lieu en ligne, pas empilés en deux phrases : lus d'un
              seul coup d'œil, comme l'en-tête d'un billet. */}
          <dl className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-4 shrink-0 text-muted" strokeWidth={1.75} aria-hidden="true" />
              <dt className="sr-only">Date</dt>
              <dd className="capitalize">{formatEventDate(event.event_date)}</dd>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <MapPin className="size-4 shrink-0 text-muted" strokeWidth={1.75} aria-hidden="true" />
              <dt className="sr-only">Point de rendez-vous</dt>
              <dd className="truncate">{event.depot_address}</dd>
            </div>
          </dl>
          {(event.arrival_time || event.departure_time || eventEndDate(event) !== event.event_date) && (
            <div className="mt-3 space-y-1 text-sm">
              {eventScheduleLines(event).map((line) => <p key={line} className="break-words">{line}</p>)}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <DownloadIcsButton event={event} />
            <CopyLinkButton />
            <QrCodeButton />
          </div>
        </div>

        {/* La couverture garde son format photo ; sur grand écran, la carte
            occupe le reste de la colonne pour mieux situer le rendez-vous.
            La carte des trajets complète (RouteMap) vient plus bas. */}
        <div className="flex shrink-0 items-start gap-2 lg:min-w-0">
          {event.has_cover_image && (
            <div className="group relative shrink-0">
              <CoverImage
                eventId={event.id}
                accessMode={event.access_mode}
                revision={coverImageRevision}
                className="aspect-[4/3] w-32 rounded-lg border border-line object-cover sm:w-44"
              />
              {canManage && (
                <>
                  <label
                    className={`absolute inset-0 flex items-center justify-center rounded-lg bg-ink/0 opacity-0 transition group-hover:bg-ink/40 group-hover:opacity-100 focus-within:bg-ink/40 focus-within:opacity-100 ${
                      uploadingCoverImage ? "cursor-wait" : "cursor-pointer"
                    }`}
                  >
                    {uploadingCoverImage ? (
                      <span className="text-xs font-medium text-paper">Envoi…</span>
                    ) : (
                      <Pencil className="size-5 text-paper" strokeWidth={1.75} aria-hidden="true" />
                    )}
                    <span className="sr-only">Changer l&apos;image</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      disabled={uploadingCoverImage || deletingCoverImage}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) onUploadCoverImage(file);
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    aria-label="Supprimer l'image de l'événement"
                    disabled={uploadingCoverImage || deletingCoverImage}
                    onClick={onDeleteCoverImage}
                    className="absolute top-1 right-1 rounded-full bg-ink/60 p-1 text-paper opacity-0 transition hover:bg-danger group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <Trash2 className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
          )}
          <LocationMap
            lat={event.depot_lat}
            lon={event.depot_lon}
            className="aspect-[4/3] w-32 rounded-lg border border-line sm:w-44 lg:aspect-auto lg:h-52 lg:min-w-0 lg:flex-1"
          />
        </div>
      </div>

      {event.description && (
        <p className="mt-4 whitespace-pre-wrap text-sm text-muted">{event.description}</p>
      )}

      {canManage && (
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <Link
            href={`/events/${event.id}/edit`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted transition hover:text-ink"
          >
            <Pencil className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
            Modifier l&apos;événement
          </Link>
          {!event.has_cover_image && (
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted transition hover:text-ink">
              <Plus className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
              {uploadingCoverImage ? "Envoi…" : "Ajouter une image"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={uploadingCoverImage}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) onUploadCoverImage(file);
                }}
              />
            </label>
          )}
        </div>
      )}
      {coverImageError && <ErrorNote>{coverImageError}</ErrorNote>}
    </section>
  );
}
