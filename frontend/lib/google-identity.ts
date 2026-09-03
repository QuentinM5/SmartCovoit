/**
 * Chargement du script Google Identity Services ("Se connecter avec
 * Google"), une seule fois par page — même motif que lib/google-maps.ts :
 * promesse partagée entre tous les appelants plutôt qu'un script par bouton.
 *
 * Flux retenu : le bouton Google renvoie directement un jeton d'identité
 * (ID token) au navigateur, envoyé tel quel à POST /auth/google — pas
 * d'redirection serveur, pas de secret client à gérer côté backend (cf.
 * décision du plan).
 */

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

interface GoogleIdentityServices {
  accounts: {
    id: {
      initialize(config: { client_id: string; callback: (response: { credential: string }) => void }): void;
      renderButton(parent: HTMLElement, options: { theme: string; size: string; text: string; width?: number }): void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}

let loader: Promise<GoogleIdentityServices> | null = null;

export function loadGoogleIdentity(): Promise<GoogleIdentityServices> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Identity Services ne peut se charger que dans le navigateur."));
  }
  if (!GOOGLE_CLIENT_ID) {
    return Promise.reject(new Error("NEXT_PUBLIC_GOOGLE_CLIENT_ID manquante au build."));
  }
  if (loader) return loader;

  loader = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google) resolve(window.google);
      else reject(new Error("Google Identity Services chargé mais indisponible."));
    };
    script.onerror = () => {
      loader = null;
      reject(new Error("chargement impossible"));
    };
    document.head.appendChild(script);
  });

  return loader;
}
