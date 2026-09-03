import { describe, expect, it } from "vitest";
import { buildEventIcs, icsFileName } from "@/lib/ics";
import type { EventDetail } from "@/lib/api";

function baseEvent(overrides: Partial<EventDetail> = {}): EventDetail {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    name: "Sortie ski",
    depot_address: "1 rue du Dépôt, Montréal",
    depot_lat: 45.5,
    depot_lon: -73.6,
    event_date: "2026-12-24",
    description: null,
    created_at: "2026-01-01T00:00:00Z",
    owner_id: null,
    has_cover_image: false,
    fuel_price_per_l: null,
    consumption_l_per_100km: null,
    drivers: [],
    passengers: [],
    ...overrides,
  };
}

describe("buildEventIcs", () => {
  it("utilise des fins de ligne CRLF", () => {
    const ics = buildEventIcs(baseEvent());
    expect(ics).toContain("\r\n");
    expect(ics.split("\n").every((line) => line === "" || line.endsWith("\r"))).toBe(true);
  });

  it("marque l'événement comme journée entière, avec DTEND au lendemain", () => {
    const ics = buildEventIcs(baseEvent({ event_date: "2026-12-24" }));
    expect(ics).toContain("DTSTART;VALUE=DATE:20261224");
    expect(ics).toContain("DTEND;VALUE=DATE:20261225");
  });

  it("l'UID est stable et dérivé de l'id d'événement (réimport = mise à jour)", () => {
    const ics = buildEventIcs(baseEvent());
    expect(ics).toContain("UID:550e8400-e29b-41d4-a716-446655440000@smartcovoit.qmeyer.fr");
  });

  it("échappe les virgules, points-virgules et retours à la ligne dans le texte libre", () => {
    const ics = buildEventIcs(baseEvent({ name: "Tournoi; foot, 5v5", description: "Ligne 1\nLigne 2" }));
    expect(ics).toContain("SUMMARY:Tournoi\\; foot\\, 5v5");
    expect(ics).toContain("Ligne 1\\nLigne 2");
  });

  it("renseigne GEO depuis les coordonnées du dépôt", () => {
    const ics = buildEventIcs(baseEvent({ depot_lat: 45.5, depot_lon: -73.6 }));
    expect(ics).toContain("GEO:45.5;-73.6");
  });

  it("replie les lignes trop longues avec une continuation indentée", () => {
    const longName = "Un nom d'événement franchement beaucoup trop long pour tenir sur une seule ligne ICS";
    const ics = buildEventIcs(baseEvent({ name: longName }));
    const rawLines = ics.split("\r\n");
    // Aucune ligne de contenu ne dépasse la limite de repliement en octets UTF-8.
    for (const line of rawLines) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(74);
    }
    // La continuation commence par un espace (RFC 5545 §3.1).
    expect(rawLines.some((l) => l.startsWith(" "))).toBe(true);
  });
});

describe("icsFileName", () => {
  it("dérive un nom de fichier ascii depuis le nom de l'événement", () => {
    expect(icsFileName(baseEvent({ name: "Sortie à vélo été 2026 !" }))).toBe("sortie-a-velo-ete-2026.ics");
  });

  it("retombe sur un nom générique si le nom ne laisse rien d'exploitable", () => {
    expect(icsFileName(baseEvent({ name: "!!!" }))).toBe("evenement.ics");
  });
});
