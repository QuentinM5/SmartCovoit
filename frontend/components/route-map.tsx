"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import type { ResolvedStop } from "@/lib/route";

/**
 * Carte des tournées, en fond OpenStreetMap — cohérent avec le reste de la
 * chaîne (géocodage Nominatim, routage OSRM) et sans clé API à gérer. Le
 * bouton « Ouvrir dans Maps » de chaque tournée, lui, pointe vers Google Maps :
 * c'est ce qui ouvre l'application native sur téléphone.
 *
 * Leaflet touche à `window` dès son import : on le charge donc dynamiquement
 * dans l'effet, jamais au niveau du module, sinon le rendu serveur casse.
 */

// Chaque véhicule sa couleur : c'est de l'information (qui va où), pas du
// décor. Teintes choisies pour rester lisibles sur fond clair comme sombre.
export const ROUTE_COLORS = [
  "#4361ee",
  "#f97316",
  "#10b981",
  "#e0479e",
  "#a855f7",
  "#64748b",
];

export interface MapRoute {
  driverName: string;
  stops: ResolvedStop[];
}

function markerHtml(kind: ResolvedStop["kind"], color: string): string {
  if (kind === "depot") {
    return `<span style="display:block;width:18px;height:18px;border-radius:9999px;background:var(--color-ink);box-shadow:0 0 0 3px var(--color-paper),0 0 0 5px var(--color-ink)"></span>`;
  }
  if (kind === "driver") {
    return `<span style="display:block;width:14px;height:14px;border-radius:9999px;background:${color};box-shadow:0 0 0 3px var(--color-paper)"></span>`;
  }
  return `<span style="display:block;width:11px;height:11px;border-radius:9999px;background:var(--color-paper);border:3px solid ${color}"></span>`;
}

export function RouteMap({ routes }: { routes: MapRoute[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layersRef = useRef<LayerGroup | null>(null);

  // Signature stable : évite de reconstruire les calques à chaque rendu quand
  // le tableau `routes` change d'identité sans changer de contenu.
  const signature = JSON.stringify(
    routes.map((r) => [r.driverName, r.stops.map((s) => [s.lat, s.lon, s.kind])]),
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        scrollWheelZoom: false,
        attributionControl: true,
      }).setView([46.81, -71.21], 10);

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      mapRef.current = map;
      layersRef.current = L.layerGroup().addTo(map);
      map.invalidateSize();
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layersRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      const map = mapRef.current;
      const layers = layersRef.current;
      if (cancelled || !map || !layers) return;

      layers.clearLayers();
      const bounds = L.latLngBounds([]);

      routes.forEach((route, index) => {
        const color = ROUTE_COLORS[index % ROUTE_COLORS.length];
        const points = route.stops.map((s) => [s.lat, s.lon] as [number, number]);
        if (points.length === 0) return;

        L.polyline(points, { color, weight: 3.5, opacity: 0.9 }).addTo(layers);

        route.stops.forEach((stop) => {
          bounds.extend([stop.lat, stop.lon]);
          L.marker([stop.lat, stop.lon], {
            icon: L.divIcon({
              className: "",
              html: markerHtml(stop.kind, color),
              iconSize: [18, 18],
              iconAnchor: [9, 9],
            }),
            keyboard: false,
          })
            .addTo(layers)
            .bindTooltip(
              stop.kind === "depot" ? "Point de rendez-vous" : `${stop.label} · ${route.driverName}`,
            );
        });
      });

      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 });
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="Carte des tournées calculées"
      className="h-[22rem] w-full overflow-hidden rounded-lg border border-line sm:h-[26rem]"
    />
  );
}
