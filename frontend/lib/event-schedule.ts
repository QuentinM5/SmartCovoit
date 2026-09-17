import type { EventOut } from "@/lib/api";

type EventDates = Pick<EventOut, "event_date" | "end_date" | "departure_next_day">;

export function addCalendarDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function eventEndDate(event: EventDates): string {
  return event.end_date ?? addCalendarDays(event.event_date, event.departure_next_day ? 1 : 0);
}

export function eventDaySpan(event: EventDates): number {
  return Math.round((Date.parse(eventEndDate(event)) - Date.parse(event.event_date)) / 86400000);
}

export function eventScheduleLines(event: EventDates & Pick<EventOut, "arrival_time" | "departure_time" | "timezone">): string[] {
  const endDate = eventEndDate(event);
  const multipleDays = endDate !== event.event_date;
  const dateLabel = (date: string) => date.split("-").reverse().join("/");
  const lines: string[] = [];
  if (event.arrival_time || multipleDays) lines.push(`Début de l’événement : ${dateLabel(event.event_date)}${event.arrival_time ? ` à ${event.arrival_time.slice(0, 5)}` : ""}`);
  if (event.departure_time || multipleDays) lines.push(`Fin de l’événement : ${dateLabel(endDate)}${event.departure_time ? ` à ${event.departure_time.slice(0, 5)}` : ""}`);
  if (event.arrival_time || event.departure_time) lines.push(`Heure locale du lieu${event.timezone ? ` · ${event.timezone}` : ""}`);
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
