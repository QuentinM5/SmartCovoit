import { describe, expect, it } from "vitest";
import { eventDaySpan, eventEndDate, eventScheduleLines, formatRouteInstant } from "@/lib/event-schedule";

describe("event schedule", () => {
  it("ne crée pas d’horaire pour les anciens événements", () => {
    expect(eventScheduleLines({ event_date: "2026-12-24" })).toEqual([]);
  });
  it("affiche les heures locales et le lendemain", () => {
    expect(eventScheduleLines({ event_date: "2026-12-24", arrival_time: "18:30:00", departure_time: "02:00:00", departure_next_day: true, timezone: "America/Toronto" })).toEqual([
      "Début de l’événement : 24/12/2026 à 18:30", "Fin de l’événement : 25/12/2026 à 02:00", "Heure locale du lieu · America/Toronto",
    ]);
  });
  it("convertit les instants dans le fuseau du lieu, y compris la veille", () => {
    expect(formatRouteInstant("2026-12-24T03:30:00Z", "America/Toronto")).toBe("23/12 22:30");
    expect(formatRouteInstant("2026-12-24T03:30:00Z", "Europe/Paris")).toBe("24/12 04:30");
  });
  it("respecte le décalage estival et ne suppose aucun fuseau", () => {
    expect(formatRouteInstant("2026-07-24T03:30:00Z", "America/Toronto")).toBe("23/07 23:30");
    expect(formatRouteInstant("2026-12-24T03:30:00Z", null)).toBeNull();
    expect(formatRouteInstant("invalide", "Europe/Paris")).toBeNull();
  });
  it("affiche plusieurs jours sans horaires et privilégie la date explicite", () => {
    const event = { event_date: "2026-12-31", end_date: "2027-01-03", departure_next_day: true };
    expect(eventEndDate(event)).toBe("2027-01-03");
    expect(eventDaySpan(event)).toBe(3);
    expect(eventScheduleLines(event)).toEqual(["Début de l’événement : 31/12/2026", "Fin de l’événement : 03/01/2027"]);
  });

});
