/**
 * Tests de lib/route.ts — fonctions pures, aucun DOM nécessaire. Volontairement
 * les premiers tests écrits sur ce socle : ils valident vitest sur du code
 * déjà en production et connu bon avant de tester du code neuf.
 */
import { describe, expect, it } from "vitest";
import { formatDistance, formatDuration, googleMapsDirectionsUrl, MAX_WAYPOINTS, resolveStops } from "@/lib/route";
import type { EventDetail, Route } from "@/lib/api";

function baseEvent(overrides: Partial<EventDetail> = {}): EventDetail {
  return {
    id: "event-1",
    name: "Test",
    depot_address: "1 rue du Dépôt",
    depot_lat: 45,
    depot_lon: -73,
    event_date: "2026-09-03",
    description: null,
    created_at: "2026-01-01T00:00:00Z",
    owner_id: null,
    has_cover_image: false,
    fuel_price_per_l: null,
    consumption_l_per_100km: null,
    currency: null,
    drivers: [],
    passengers: [],
    ...overrides,
  };
}

describe("resolveStops", () => {
  it("résout le nœud 0 comme le dépôt", () => {
    const event = baseEvent();
    const route: Route = {
      driver_id: "d1",
      driver_name: "Alice",
      distance_m: 1000,
      stops: [{ node: 0, passenger_id: null, passenger_name: null, cumulative_distance_m: 0 }],
    };
    const [stop] = resolveStops(route, event);
    expect(stop.kind).toBe("depot");
    expect(stop.label).toBe(event.depot_address);
  });

  it("résout un arrêt passager en cherchant le passager par id", () => {
    const event = baseEvent({
      passengers: [{ id: "p1", name: "Bob", address: "2 rue B", lat: 1, lon: 2, direction: "ramassage", user_id: null }],
    });
    const route: Route = {
      driver_id: "d1",
      driver_name: "Alice",
      distance_m: 1000,
      stops: [{ node: 2, passenger_id: "p1", passenger_name: "Bob", cumulative_distance_m: 500 }],
    };
    const [stop] = resolveStops(route, event);
    expect(stop.kind).toBe("passenger");
    expect(stop.id).toBe("p1");
    expect(stop.label).toBe("Bob");
  });

  it("ignore un arrêt passager dont le passager a disparu de l'événement (flatMap vide)", () => {
    const event = baseEvent();
    const route: Route = {
      driver_id: "d1",
      driver_name: "Alice",
      distance_m: 1000,
      stops: [{ node: 2, passenger_id: "introuvable", passenger_name: "?", cumulative_distance_m: 500 }],
    };
    expect(resolveStops(route, event)).toEqual([]);
  });

  it("libelle différemment le domicile du conducteur selon le sens", () => {
    const driver = {
      id: "d1",
      name: "Chloé",
      seats: 3,
      address: "3 rue C",
      lat: 1,
      lon: 2,
      direction: "dispersion" as const,
      user_id: null,
    };
    const event = baseEvent({ drivers: [driver] });
    const route: Route = {
      driver_id: "d1",
      driver_name: "Chloé",
      distance_m: 1000,
      stops: [{ node: 1, passenger_id: null, passenger_name: null, cumulative_distance_m: 0 }],
    };
    const [stop] = resolveStops(route, event);
    expect(stop.label).toBe("Retour chez Chloé");
  });
});

describe("googleMapsDirectionsUrl", () => {
  const stop = (lat: number, lon: number) => ({ kind: "passenger" as const, label: "x", lat, lon, cumulativeDistanceM: 0 });

  it("renvoie null avec moins de deux arrêts", () => {
    expect(googleMapsDirectionsUrl([])).toBeNull();
    expect(googleMapsDirectionsUrl([stop(1, 2)])).toBeNull();
  });

  it("construit une URL avec origine et destination", () => {
    const url = googleMapsDirectionsUrl([stop(1, 2), stop(3, 4)]);
    expect(url).toContain("origin=1%2C2");
    expect(url).toContain("destination=3%2C4");
  });

  it("tronque les étapes intermédiaires à MAX_WAYPOINTS", () => {
    const stops = Array.from({ length: MAX_WAYPOINTS + 5 }, (_, i) => stop(i, i));
    const url = googleMapsDirectionsUrl(stops)!;
    const waypoints = new URL(url).searchParams.get("waypoints")!;
    expect(waypoints.split("|")).toHaveLength(MAX_WAYPOINTS);
  });
});

describe("formatDistance", () => {
  it("affiche les mètres sous 1000 m", () => {
    expect(formatDistance(950)).toBe("950 m");
  });
  it("affiche les kilomètres avec une décimale au-delà", () => {
    expect(formatDistance(12345)).toBe("12,3 km");
  });
});

describe("formatDuration", () => {
  it("affiche des minutes sous une heure", () => {
    expect(formatDuration(25 * 60)).toBe("25 min");
  });
  it("affiche des heures rondes sans minutes si nulles", () => {
    expect(formatDuration(2 * 3600)).toBe("2 h");
  });
  it("affiche heures et minutes avec un zéro de tête", () => {
    expect(formatDuration(2 * 3600 + 5 * 60)).toBe("2 h 05");
  });
});
