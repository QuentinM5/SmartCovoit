"use client";

import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { CopyLinkButton } from "@/components/copy-link-button";
import { DownloadIcsButton } from "@/components/download-ics-button";
import { LocationMap } from "@/components/location-map";
import { ErrorNote } from "@/components/ui";
import { coverImageUrl, type Direction, type EventDetail } from "@/lib/api";
import { formatEventDate } from "@/lib/event-format";

export function EventHeader({
  event,
  viewDirection,
  canManage,
  uploadingCoverImage,
  deletingCoverImage,
  coverImageError,
  onUploadCoverImage,
  onDeleteCoverImage,
}: {
  event: EventDetail;
  viewDirection: Direction;
  /** Changer l'image de couverture est réservé à l'organisateur — sauf pour
   * un événement créé avant l'authentification (owner_id nul), resté ouvert
   * à tout compte connecté, cf. matrice d'autorisation côté backend. */
  canManage: boolean;
  uploadingCoverImage: boolean;
  deletingCoverImage: boolean;
  coverImageError: string | null;
  onUploadCoverImage: (file: File) => void;
  onDeleteCoverImage: () => void;
}) {
  const dispersion = viewDirection === "dispersion";

  return (
    <section>
      {/* Titre d'abord dans le DOM, visuels ensuite : sur mobile (colonne)
          ça place naturellement l'image et la mini-carte sous le titre ;
          à partir de `sm:` (ligne), le titre se retrouve à gauche et les
          visuels à droite — sans dupliquer le balisage pour chaque taille. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{event.name}</h1>
          <p className="mt-1 text-sm text-muted capitalize">{formatEventDate(event.event_date)}</p>
          <p className="mt-0.5 text-sm text-muted">
            {dispersion ? "Retour depuis" : "Aller vers"} <span className="text-ink">{event.depot_address}</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <DownloadIcsButton event={event} />
            <CopyLinkButton />
          </div>
        </div>

        {/* Deux vignettes au format proche d'une photo standard (4:3), pas
            la bannière large utilisée dans une version précédente — l'image
            (si présente) et le point de rendez-vous : la carte des trajets
            complète (RouteMap) vient plus bas, une fois un calcul fait. */}
        <div className="flex shrink-0 gap-2">
          {event.has_cover_image && (
            <div className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- servie par le backend, pas next/image (cas d'usage trop ponctuel pour justifier l'optimisation). */}
              <img
                src={coverImageUrl(event.id)}
                alt=""
                className="aspect-[4/3] w-28 rounded-lg border border-line object-cover sm:w-36"
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
            className="aspect-[4/3] w-28 rounded-lg border border-line sm:w-36"
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
              <Pencil className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
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
