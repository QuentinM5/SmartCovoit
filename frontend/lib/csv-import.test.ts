import { describe, expect, it } from "vitest";
import { detectColumn, inferRole, parseSeats } from "@/lib/csv-import";

describe("detectColumn", () => {
  it("reconnaît un en-tête de nom en français ou en anglais", () => {
    expect(detectColumn("Nom complet")).toBe("name");
    expect(detectColumn("Full Name")).toBe("name");
  });

  it("reconnaît un en-tête d'adresse", () => {
    expect(detectColumn("Ton adresse de départ")).toBe("address");
  });

  it("reconnaît un en-tête de places", () => {
    expect(detectColumn("Nombre de places disponibles")).toBe("seats");
  });

  it("retombe sur ignore pour un en-tête non reconnu", () => {
    expect(detectColumn("Horodateur")).toBe("ignore");
  });

  it("n'est pas sensible à la casse", () => {
    expect(detectColumn("ADRESSE")).toBe("address");
  });
});

describe("parseSeats", () => {
  it("lit un nombre de places valide", () => {
    expect(parseSeats("3")).toBe(3);
  });

  it("renvoie null pour une valeur vide, nulle ou non numérique", () => {
    expect(parseSeats(undefined)).toBeNull();
    expect(parseSeats("")).toBeNull();
    expect(parseSeats("0")).toBeNull();
    expect(parseSeats("pas de voiture")).toBeNull();
  });
});

describe("inferRole", () => {
  it("un nombre de places positif => conducteur", () => {
    expect(inferRole("4")).toBe("driver");
  });

  it("une valeur vide ou nulle => passager", () => {
    expect(inferRole(undefined)).toBe("passenger");
    expect(inferRole("0")).toBe("passenger");
    expect(inferRole("")).toBe("passenger");
  });
});
