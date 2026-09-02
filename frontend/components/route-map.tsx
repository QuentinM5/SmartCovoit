"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/google-maps";
import type { ResolvedStop } from "@/lib/route";

/**
 * Carte des tournées (Google Maps).
 *
 * Le tracé vient d'OSRM, pas de l'API Directions de Google : les distances qui
 * font foi sont celles du solveur, et ça évite un service facturé de plus. Sans
 * géométrie (OSRM absent), on relie les arrêts en pointillé — le trait dit
 * alors clairement « schéma », pas « chemin praticable ».
 */

// Une couleur par véhicule : c'est de l'information (qui va où), pas du décor.
export const ROUTE_COLORS = ["#4361ee", "#f97316", "#10b981", "#e0479e", "#a855f7", "#64748b"];

export interface MapRoute {
  driverName: string;
  stops: ResolvedStop[];
  geometry?: number[][] | null;
}

// Fond épuré : les routes et libellés restent lisibles sans concurrencer les
// tournées colorées posées par-dessus.
const LIGHT_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "simplified" }] },
];

const DARK_STYLE: google.maps.MapTypeStyle[] = [
  ...LIGHT_STYLE,
  { elementType: "geometry", stylers: [{ color: "#1b2027" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8b96a5" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#11151a" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a313b" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3a434f" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1116" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#171c23" }] },
];

function stopMarkerIcon(
  g: typeof google,
  stop: ResolvedStop,
  color: string,
  index: number | null,
): google.maps.Symbol | google.maps.Icon {
  if (stop.kind === "depot") {
    return {
      path: g.maps.SymbolPath.CIRCLE,
      scale: 8,
      fillColor: "#111417",
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight: 3,
    };
  }
  if (stop.kind === "driver") {
    return {
      path: g.maps.SymbolPath.CIRCLE,
      scale: 7,
      fillColor: color,
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight: 2.5,
    };
  }
  return {
    path: g.maps.SymbolPath.CIRCLE,
    scale: 6,
    fillColor: "#ffffff",
    fillOpacity: 1,
    strokeColor: color,
    strokeWeight: 3,
    labelOrigin: index !== null ? new g.maps.Point(0, 0) : undefined,
  };
}

export function RouteMap({
  routes,
  highlightedRoute,
}: {
  routes: MapRoute[];
  highlightedRoute?: number | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<(google.maps.Polyline | google.maps.Marker)[]>([]);
  const googleRef = useRef<typeof google | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signature = JSON.stringify(
    routes.map((r) => [r.driverName, r.stops.map((s) => [s.lat, s.lon, s.kind]), r.geometry?.length ?? 0]),
  );

  useEffect(() => {
    let cancelled = false;

    loadGoogleMaps()
      .then(async (g) => {
        await g.maps.importLibrary("maps");
        if (cancelled || !containerRef.current || mapRef.current) return;
        googleRef.current = g;
        mapRef.current = new g.maps.Map(containerRef.current, {
          center: { lat: 46.81, lng: -71.21 },
          zoom: 10,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "cooperative",
          styles: document.documentElement.classList.contains("dark") ? DARK_STYLE : LIGHT_STYLE,
        });
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Le style suit la bascule de thème, qui pose/retire la classe sur <html>.
  useEffect(() => {
    const observer = new MutationObserver(() => {
      mapRef.current?.setOptions({
        styles: document.documentElement.classList.contains("dark") ? DARK_STYLE : LIGHT_STYLE,
      });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      await loadGoogleMaps().catch(() => null);
      const g = googleRef.current;
      const map = mapRef.current;
      if (cancelled || !g || !map) return;

      overlaysRef.current.forEach((o) => o.setMap(null));
      overlaysRef.current = [];

      const bounds = new g.maps.LatLngBounds();

      routes.forEach((route, routeIndex) => {
        const color = ROUTE_COLORS[routeIndex % ROUTE_COLORS.length];
        const dimmed = highlightedRoute != null && highlightedRoute !== routeIndex;
        const stopPath = route.stops.map((s) => ({ lat: s.lat, lng: s.lon }));
        if (stopPath.length === 0) return;

        const hasGeometry = Array.isArray(route.geometry) && route.geometry.length > 1;
        const path = hasGeometry
          ? (route.geometry as number[][]).map((p) => ({ lat: p[0], lng: p[1] }))
          : stopPath;

        // Liseré sombre sous le trait : garde la ligne lisible quel que soit
        // le fond, technique cartographique classique.
        if (hasGeometry) {
          overlaysRef.current.push(
            new g.maps.Polyline({
              path,
              map,
              strokeColor: "#0b0e12",
              strokeOpacity: dimmed ? 0.12 : 0.35,
              strokeWeight: 8,
              zIndex: routeIndex * 10,
            }),
          );
        }

        overlaysRef.current.push(
          new g.maps.Polyline({
            path,
            map,
            strokeColor: color,
            strokeOpacity: hasGeometry ? (dimmed ? 0.25 : 1) : 0,
            strokeWeight: 4,
            zIndex: routeIndex * 10 + 1,
            icons: hasGeometry
              ? [
                  {
                    // Flèches de sens : on voit dans quel ordre la tournée se fait.
                    icon: { path: g.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 2.5, fillColor: color, fillOpacity: dimmed ? 0.25 : 1, strokeOpacity: 0 },
                    offset: "0",
                    repeat: "110px",
                  },
                ]
              : [
                  {
                    icon: { path: "M 0,-1 0,1", strokeOpacity: dimmed ? 0.2 : 0.9, strokeColor: color, strokeWeight: 4, scale: 3 },
                    offset: "0",
                    repeat: "14px",
                  },
                ],
          }),
        );

        let passengerNumber = 0;
        route.stops.forEach((stop) => {
          bounds.extend({ lat: stop.lat, lng: stop.lon });
          const isPassenger = stop.kind === "passenger";
          if (isPassenger) passengerNumber += 1;

          overlaysRef.current.push(
            new g.maps.Marker({
              position: { lat: stop.lat, lng: stop.lon },
              map,
              title:
                stop.kind === "depot"
                  ? "Point de rendez-vous"
                  : `${stop.label} · ${route.driverName}`,
              icon: stopMarkerIcon(g, stop, color, isPassenger ? passengerNumber : null),
              label: isPassenger
                ? {
                    text: String(passengerNumber),
                    color,
                    fontSize: "10px",
                    fontWeight: "600",
                    fontFamily: "monospace",
                  }
                : undefined,
              opacity: dimmed ? 0.35 : 1,
              zIndex: routeIndex * 10 + (stop.kind === "depot" ? 5 : 2),
            }),
          );
        });
      });

      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, 48);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, highlightedRoute]);

  if (error) {
    return (
      <div className="rounded-lg border border-line bg-surface px-4 py-6 text-sm text-muted">
        Carte indisponible ({error}). Les trajets restent lisibles ci-dessous.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="Carte des trajets calculés"
      className="h-[22rem] w-full overflow-hidden rounded-lg border border-line sm:h-[26rem] lg:h-[34rem]"
    />
  );
}
