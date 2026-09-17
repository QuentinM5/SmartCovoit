import { describe, expect, it } from "vitest";
import { eventScheduleLines, formatRouteInstant } from "@/lib/event-schedule";

describe("event schedule", () => {
  it("ne crée pas d’horaire pour les anciens événements", () => {
    expect(eventScheduleLines({})).toEqual([]);
  });
  it("affiche les heures locales et le lendemain", () => {
    expect(eventScheduleLines({ arrival_time: "18:30:00", departure_time: "02:00:00", departure_next_day: true, timezone: "America/Toronto" })).toEqual([
      "Arrivée au rassemblement : 18:30", "Départ pour la dispersion : 02:00 (lendemain)", "Heure locale du lieu · America/Toronto",
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
});
