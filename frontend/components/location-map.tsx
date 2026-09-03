"use client";

/**
 * Mini-carte montrant uniquement le point de rendez-vous — pas les
 * tournées (cf. RouteMap, plus bas sur la page événement, une fois un
 * calcul fait). Sert à situer l'événement d'un coup d'œil au niveau du
 * titre, avant même toute inscription.
 */

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps, MAP_DARK_STYLE, MAP_LIGHT_STYLE } from "@/lib/google-maps";

export function LocationMap({ lat, lon, className }: { lat: number; lon: number; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let map: google.maps.Map | null = null;

    loadGoogleMaps()
      .then(async (g) => {
        await g.maps.importLibrary("maps");
        if (cancelled || !containerRef.current) return;
        map = new g.maps.Map(containerRef.current, {
          center: { lat, lng: lon },
          // Rapproché : un seul point à situer, pas un ensemble d'arrêts à
          // faire tenir dans le cadre comme pour RouteMap.
          zoom: 15,
          disableDefaultUI: true,
          gestureHandling: "cooperative",
          styles: document.documentElement.classList.contains("dark") ? MAP_DARK_STYLE : MAP_LIGHT_STYLE,
        });
        new g.maps.Marker({
          position: { lat, lng: lon },
          map,
          // Même pastille pleine que le point "dépôt" dans RouteMap —
          // cohérence visuelle entre les deux cartes de l'appli.
          icon: {
            path: g.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#111417",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 3,
          },
        });
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  if (error) {
    // Dégrade silencieusement en un simple repère visuel plutôt qu'un
    // message d'erreur — l'adresse textuelle à côté du titre suffit déjà à
    // situer l'événement.
    return <div className={className} aria-hidden="true" />;
  }

  return <div ref={containerRef} role="img" aria-label="Emplacement du point de rendez-vous" className={className} />;
}
