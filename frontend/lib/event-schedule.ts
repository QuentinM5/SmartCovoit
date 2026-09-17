import type { EventOut } from "@/lib/api";

export function eventScheduleLines(event: Pick<EventOut, "arrival_time" | "departure_time" | "departure_next_day" | "timezone">): string[] {
  const lines: string[] = [];
  if (event.arrival_time) lines.push(`Arrivée au rassemblement : ${event.arrival_time.slice(0, 5)}`);
  if (event.departure_time) lines.push(`Départ pour la dispersion : ${event.departure_time.slice(0, 5)}${event.departure_next_day ? " (lendemain)" : ""}`);
  if (lines.length) lines.push(`Heure locale du lieu${event.timezone ? ` · ${event.timezone}` : ""}`);
  return lines;
}

/** Never fall back to the browser's zone when the event zone is unavailable. */
export function formatRouteInstant(instant: string | null | undefined, timezone: string | null | undefined): string | null {
  if (!instant || !timezone) return null;
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      timeZone: timezone, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    }).format(date);
  } catch {
    return null;
  }
}
