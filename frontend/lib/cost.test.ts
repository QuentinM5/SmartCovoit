import { describe, expect, it } from "vitest";
import { routeCostEuros, splitPerPersonEuros } from "@/lib/cost";

describe("routeCostEuros", () => {
  it("applique les valeurs par défaut quand le barème n'est pas personnalisé", () => {
    // 100 km à 6,5 L/100km et 1,75 €/L = 6,5 L * 1,75 € = 11,375 €
    const cost = routeCostEuros(100_000, { fuelPricePerL: null, consumptionLPer100Km: null });
    expect(cost).toBeCloseTo(11.375, 3);
  });

  it("applique le barème personnalisé de l'événement", () => {
    const cost = routeCostEuros(50_000, { fuelPricePerL: 2, consumptionLPer100Km: 8 });
    // 50 km * 8L/100km = 4 L * 2 € = 8 €
    expect(cost).toBeCloseTo(8, 3);
  });

  it("une distance nulle coûte zéro", () => {
    expect(routeCostEuros(0, { fuelPricePerL: 2, consumptionLPer100Km: 8 })).toBe(0);
  });
});

describe("splitPerPersonEuros", () => {
  it("divise entre le conducteur et ses passagers (conducteur inclus)", () => {
    expect(splitPerPersonEuros(20, 3)).toBe(5); // 20 € / (3 passagers + 1 conducteur)
  });

  it("le conducteur seul paie tout", () => {
    expect(splitPerPersonEuros(10, 0)).toBe(10);
  });
});
