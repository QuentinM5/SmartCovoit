/** @vitest-environment jsdom */

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocationMap } from "./location-map";
import { RouteMap, type MapRoute } from "./route-map";
import { loadGoogleMaps, MAP_DARK_STYLE, MAP_LIGHT_STYLE } from "@/lib/google-maps";

vi.mock("@/lib/google-maps", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/google-maps")>()),
  loadGoogleMaps: vi.fn(),
}));

const maps: { setOptions: ReturnType<typeof vi.fn>; fitBounds: ReturnType<typeof vi.fn> }[] = [];
const layers: { setMap: ReturnType<typeof vi.fn> }[] = [];
const overlays: { setMap: ReturnType<typeof vi.fn> }[] = [];
let finishImport: () => void;

beforeEach(() => {
  maps.length = layers.length = overlays.length = 0;
  const imported = new Promise<void>((resolve) => { finishImport = resolve; });
  class MapMock {
    setOptions = vi.fn();
    fitBounds = vi.fn();
    constructor() { maps.push(this); }
  }
  class TransitMock {
    setMap = vi.fn();
    constructor() { layers.push(this); }
  }
  class OverlayMock {
    setMap = vi.fn();
    constructor() { overlays.push(this); }
  }
  vi.mocked(loadGoogleMaps).mockResolvedValue({ maps: {
    importLibrary: () => imported,
    Map: MapMock,
    TransitLayer: TransitMock,
    Marker: OverlayMock,
    Polyline: OverlayMock,
    SymbolPath: { CIRCLE: 0, FORWARD_CLOSED_ARROW: 1 },
    LatLngBounds: class { extend() {} isEmpty() { return false; } },
  } } as unknown as typeof google);
});

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("dark");
  vi.clearAllMocks();
});

const routes: MapRoute[] = [{
  driverName: "Alex",
  stops: [
    { kind: "driver", label: "Alex", lat: 45.5, lon: -73.6, cumulativeDistanceM: 0 },
    { kind: "depot", label: "Arrivée", lat: 45.51, lon: -73.61, cumulativeDistanceM: 1000 },
  ],
  geometry: [[45.5, -73.6], [45.51, -73.61]],
}];

describe("Google Maps transit lifecycle", () => {
  it("draws routes after the maps library resolves and keeps transit through highlighting and theme changes", async () => {
    const { rerender, unmount } = render(<RouteMap routes={routes} />);
    await act(async () => {});
    expect(maps).toHaveLength(0);
    await act(async () => { finishImport(); });
    expect(layers).toHaveLength(1);
    expect(layers[0].setMap).toHaveBeenCalledWith(maps[0]);
    expect(overlays).toHaveLength(4);
    expect(maps[0].fitBounds).toHaveBeenCalled();
    const initialOverlays = [...overlays];

    rerender(<RouteMap routes={routes} highlightedRoute={1} />);
    initialOverlays.forEach((overlay) => expect(overlay.setMap).toHaveBeenCalledWith(null));
    expect(overlays).toHaveLength(8);
    expect(layers[0].setMap).toHaveBeenCalledTimes(1);

    await act(async () => { document.documentElement.classList.add("dark"); });
    expect(maps[0].setOptions).toHaveBeenLastCalledWith({ styles: MAP_DARK_STYLE });
    await act(async () => { document.documentElement.classList.remove("dark"); });
    expect(maps[0].setOptions).toHaveBeenLastCalledWith({ styles: MAP_LIGHT_STYLE });
    unmount();
    expect(layers[0].setMap).toHaveBeenLastCalledWith(null);
    overlays.forEach((overlay) => expect(overlay.setMap).toHaveBeenCalledWith(null));
  });

  it("detaches location transit and marker when coordinates change or the map unmounts", async () => {
    const { rerender, unmount } = render(<LocationMap lat={45.5} lon={-73.6} />);
    await act(async () => { finishImport(); });
    expect(layers[0].setMap).toHaveBeenCalledWith(maps[0]);
    rerender(<LocationMap lat={45.51} lon={-73.61} />);
    await act(async () => {});
    expect(layers[0].setMap).toHaveBeenLastCalledWith(null);
    expect(overlays[0].setMap).toHaveBeenLastCalledWith(null);
    expect(layers[1].setMap).toHaveBeenCalledWith(maps[1]);
    unmount();
    expect(layers[1].setMap).toHaveBeenLastCalledWith(null);
    expect(overlays[1].setMap).toHaveBeenLastCalledWith(null);
  });

  it("does not create maps or transit layers after unmount during loading", async () => {
    const { unmount } = render(<><LocationMap lat={45.5} lon={-73.6} /><RouteMap routes={routes} /></>);
    await act(async () => {});
    unmount();
    await act(async () => { finishImport(); });
    expect(maps).toHaveLength(0);
    expect(layers).toHaveLength(0);
  });
});
