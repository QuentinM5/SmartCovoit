"use client";

import { ImagePlus } from "lucide-react";
import { DirectionGlyph } from "@/components/direction";
import { CopyLinkButton } from "@/components/copy-link-button";
import { LocationMap } from "@/components/location-map";
import { ErrorNote } from "@/components/ui";
import { coverImageUrl, type Direction, type EventDetail } from "@/lib/api";
import { formatEventDate } from "@/lib/event-format";

export function EventHeader({
  event,
  viewDirection,
  canManage,
  uploadingCoverImage,
  coverImageError,
  onUploadCoverImage,
}: {
  event: EventDetail;
  viewDirection: Direction;
  /** Changer l'image de couverture est réservé à l'organisateur — sauf pour
   * un événement créé avant l'authentification (owner_id nul), resté ouvert
   * à tout compte connecté, cf. matrice d'autorisation côté backend. */
  canManage: boolean;
  uploadingCoverImage: boolean;
  coverImageError: string | null;
  onUploadCoverImage: (file: File) => void;
}) {
  const dispersion = viewDirection === "dispersion";

  return (
    <section>
      <div className="flex flex-wrap items-start gap-4">
        {/* Deux vignettes au format proche d'une photo standard (4:3),
            pas la bannière large utilisée dans une version précédente
            — l'image (si présente) et le point de rendez-vous, côte à
            côte : la carte des trajets complète (RouteMap) vient plus
            bas, une fois un calcul fait. */}
        <div className="flex shrink-0 gap-2">
          {event.has_cover_image && (
            // eslint-disable-next-line @next/next/no-img-element -- servie par le backend, pas next/image (cas d'usage trop ponctuel pour justifier l'optimisation).
            <img
              src={coverImageUrl(event.id)}
              alt=""
              className="aspect-[4/3] w-28 rounded-lg border border-line object-cover sm:w-36"
            />
          )}
          <LocationMap
            lat={event.depot_lat}
            lon={event.depot_lon}
            className="aspect-[4/3] w-28 rounded-lg border border-line sm:w-36"
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <DirectionGlyph
              direction={viewDirection}
              className={`mt-1 h-10 w-14 shrink-0 ${dispersion ? "text-outbound" : "text-inbound"}`}
            />
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{event.name}</h1>
              <p className="mt-1 text-sm text-muted capitalize">{formatEventDate(event.event_date)}</p>
              <p className="mt-0.5 text-sm text-muted">
                {dispersion ? "Retour depuis" : "Aller vers"}{" "}
                <span className="text-ink">{event.depot_address}</span>
              </p>
            </div>
          </div>
          <CopyLinkButton className="mt-1" />
        </div>
      </div>

      {event.description && (
        <p className="mt-4 whitespace-pre-wrap text-sm text-muted">{event.description}</p>
      )}

      {canManage && (
        <label className="mt-3 inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted transition hover:text-ink">
          <ImagePlus className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
          {uploadingCoverImage
            ? "Envoi…"
            : event.has_cover_image
              ? "Changer l'image"
              : "Ajouter une image"}
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
      {coverImageError && <ErrorNote>{coverImageError}</ErrorNote>}
    </section>
  );
}
