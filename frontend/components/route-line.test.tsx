/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RouteLine } from "@/components/route-line";

vi.mock("@/components/route-map", () => ({ ROUTE_COLORS: ["#005599"] }));
afterEach(cleanup);

const base = { driverId: "driver", driverName: "Alice", seats: 3, distanceM: 15000, durationS: 1200, stops: [], index: 0 };

describe("horaires estimés des tournées", () => {
  it("affiche la date locale et le trafic prévu", () => {
    render(<RouteLine {...base} estimatedDepartureAt="2026-12-24T03:30:00Z" estimatedArrivalAt="2026-12-24T04:00:00Z" estimationBasis="traffic" timezone="America/Toronto" />);
    expect(screen.getByText("Départ estimé : 23/12 22:30")).toBeTruthy();
    expect(screen.getByText("Arrivée estimée : 23/12 23:00")).toBeTruthy();
    expect(screen.getByText(/America\/Toronto · trafic prévu/)).toBeTruthy();
  });

  it("identifie le repli sans trafic", () => {
    render(<RouteLine {...base} estimatedDepartureAt="2026-12-24T03:30:00Z" estimationBasis="typical" timezone="Europe/Paris" />);
    expect(screen.getByText("Départ estimé : 24/12 04:30")).toBeTruthy();
    expect(screen.getByText(/Europe\/Paris · sans trafic/)).toBeTruthy();
    expect(screen.queryByText(/Arrivée estimée/)).toBeNull();
  });

  it("ne fabrique pas d’horaires pour les anciennes solutions", () => {
    render(<RouteLine {...base} />);
    expect(screen.queryByText(/Départ estimé/)).toBeNull();
    expect(screen.queryByText(/Arrivée estimée/)).toBeNull();
  });
});
