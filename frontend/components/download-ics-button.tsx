"use client";

import { CalendarPlus } from "lucide-react";
import { buildEventIcs, icsFileName } from "@/lib/ics";
import { capture } from "@/lib/telemetry";
import type { EventDetail } from "@/lib/api";

/** Même esprit que CopyLinkButton : une action ponctuelle, pas de requête
 * serveur (tout le contenu du .ics est déjà dans `event`, cf. lib/ics.ts). */
export function DownloadIcsButton({ event, className }: { event: EventDetail; className?: string }) {
  function handleDownload() {
    capture("ics_downloaded", { event_id: event.id });
    const blob = new Blob([buildEventIcs(event)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = icsFileName(event);
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium transition hover:border-ink ${className ?? ""}`}
    >
      <CalendarPlus className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
      Ajouter au calendrier
    </button>
  );
}
