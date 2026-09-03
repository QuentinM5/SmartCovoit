import { describe, expect, it } from "vitest";
import { formatEventDate, moveStopOptimistic, networkMessage } from "@/lib/event-format";
import { ApiError, type Solution } from "@/lib/api";

describe("formatEventDate", () => {
  it("ne retombe pas sur la veille dans un fuseau à l'ouest de l'UTC", () => {
    // Régression : `new Date("2026-09-02")` seul est interprété en UTC minuit,
    // qui peut redevenir le 1er selon le fuseau local d'exécution des tests.
    const formatted = formatEventDate("2026-09-02");
    expect(formatted).toContain("2026");
    expect(formatted.toLowerCase()).toContain("septembre");
  });
});

describe("networkMessage", () => {
  it("renvoie le message d'une ApiError", () => {
    expect(networkMessage(new ApiError(404, "Introuvable"), "repli")).toBe("Introuvable");
  });
  it("renvoie le repli pour une erreur qui n'est pas une ApiError", () => {
    expect(networkMessage(new Error("boom"), "repli")).toBe("repli");
    expect(networkMessage("chaine quelconque", "repli")).toBe("repli");
  });
});

function baseSolution(overrides: Partial<Solution> = {}): Solution {
  return {
    id: "s1",
    event_id: "e1",
    direction: "ramassage",
    total_distance_m: 1000,
    matrix_source: "osrm",
    fallback_reason: null,
    routes: [],
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("moveStopOptimistic", () => {
  it("déplace l'arrêt du passager vers la tournée cible, avant le dernier arrêt (dépôt/domicile)", () => {
    const passengerStop = { node: 2, passenger_id: "p1", passenger_name: "Bob", cumulative_distance_m: 100 };
    const boundaryA = { node: 0, passenger_id: null, passenger_name: null, cumulative_distance_m: 200 };
    const boundaryB = { node: 0, passenger_id: null, passenger_name: null, cumulative_distance_m: 50 };
    const solution = baseSolution({
      routes: [
        { driver_id: "d1", driver_name: "A", distance_m: 200, stops: [passengerStop, boundaryA] },
        { driver_id: "d2", driver_name: "B", distance_m: 50, stops: [boundaryB] },
      ],
    });

    const next = moveStopOptimistic(solution, "p1", "d2");

    const routeA = next.routes.find((r) => r.driver_id === "d1")!;
    const routeB = next.routes.find((r) => r.driver_id === "d2")!;
    expect(routeA.stops).toEqual([boundaryA]);
    expect(routeB.stops).toEqual([passengerStop, boundaryB]);
  });

  it("ne change rien si le passager n'est trouvé dans aucune tournée", () => {
    const solution = baseSolution({
      routes: [{ driver_id: "d1", driver_name: "A", distance_m: 0, stops: [] }],
    });
    expect(moveStopOptimistic(solution, "introuvable", "d1")).toBe(solution);
  });
});
