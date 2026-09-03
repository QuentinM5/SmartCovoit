/**
 * Chargement de l'API Google Maps, une seule fois par page.
 *
 * Le script est volumineux : on le charge à la demande et on partage la même
 * promesse entre tous les appelants, sinon chaque champ d'adresse et chaque
 * carte en déclencheraient un exemplaire.
 */

export const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

// Fond épuré commun à toutes les cartes de l'appli (tournées, point de
// rendez-vous) : les repères posés par-dessus restent lisibles sans
// concurrencer le fond. Centralisé ici plutôt que dupliqué par composant.
export const MAP_LIGHT_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "simplified" }] },
];

export const MAP_DARK_STYLE: google.maps.MapTypeStyle[] = [
  ...MAP_LIGHT_STYLE,
  { elementType: "geometry", stylers: [{ color: "#1b2027" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8b96a5" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#11151a" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a313b" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3a434f" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1116" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#171c23" }] },
];

let loader: Promise<typeof google> | null = null;

export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps ne peut se charger que dans le navigateur."));
  }
  if (!GOOGLE_MAPS_API_KEY) {
    return Promise.reject(new Error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY manquante au build."));
  }
  if (loader) return loader;

  loader = new Promise((resolve, reject) => {
    // On passe par le paramètre `callback` plutôt que par script.onload : avec
    // `loading=async`, onload se déclenche AVANT que `window.google` soit
    // assigné, et la promesse résoudrait `undefined`. Le callback, lui, n'est
    // appelé qu'une fois l'API réellement prête.
    const callbackName = "__smartcovoitMapsReady";
    const w = window as typeof window & Record<string, unknown>;

    w[callbackName] = () => {
      delete w[callbackName];
      resolve(window.google);
    };

    const script = document.createElement("script");
    const params = new URLSearchParams({
      key: GOOGLE_MAPS_API_KEY,
      v: "weekly",
      libraries: "maps,marker,places",
      language: "fr-CA",
      region: "CA",
      loading: "async",
      callback: callbackName,
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.onerror = () => {
      loader = null;
      reject(new Error("chargement impossible"));
    };
    document.head.appendChild(script);
  });

  return loader;
}
