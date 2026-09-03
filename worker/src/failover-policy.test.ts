import { describe, expect, it } from "vitest";
import { shouldReplay } from "./failover-policy";

describe("shouldReplay", () => {
  it("rejoue toujours un échec de transport, quelle que soit la méthode", () => {
    expect(shouldReplay("GET", "transport")).toBe(true);
    expect(shouldReplay("POST", "transport")).toBe(true);
    expect(shouldReplay("DELETE", "transport")).toBe(true);
  });

  it("rejoue un 5xx pour une méthode sûre (lecture)", () => {
    expect(shouldReplay("GET", "server-error")).toBe(true);
    expect(shouldReplay("HEAD", "server-error")).toBe(true);
    expect(shouldReplay("OPTIONS", "server-error")).toBe(true);
  });

  it("ne rejoue pas un 5xx pour une écriture (le primaire a pu déjà l'appliquer)", () => {
    expect(shouldReplay("POST", "server-error")).toBe(false);
    expect(shouldReplay("PATCH", "server-error")).toBe(false);
    expect(shouldReplay("DELETE", "server-error")).toBe(false);
  });

  it("n'est pas sensible à la casse de la méthode", () => {
    expect(shouldReplay("post", "server-error")).toBe(false);
    expect(shouldReplay("get", "server-error")).toBe(true);
  });
});
