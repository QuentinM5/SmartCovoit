"use client";

import { useEffect, useRef, useState } from "react";
import { GOOGLE_CLIENT_ID, loadGoogleIdentity } from "@/lib/google-identity";

/**
 * Bouton "Se connecter avec Google" officiel (rendu par le SDK lui-même,
 * pas un bouton maison) — dégrade silencieusement (rien affiché) si
 * NEXT_PUBLIC_GOOGLE_CLIENT_ID est absente ou si le script ne charge pas :
 * le formulaire email/mot de passe à côté reste utilisable.
 */
export function GoogleSignInButton({ onIdToken }: { onIdToken: (idToken: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Ref plutôt qu'une dépendance d'effet : `onIdToken` est une fonction
  // inline côté appelant, qui change de référence à chaque rendu — sans
  // ça, le bouton Google serait ré-initialisé en boucle.
  const onIdTokenRef = useRef(onIdToken);
  useEffect(() => {
    onIdTokenRef.current = onIdToken;
  }, [onIdToken]);

  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      // `queueMicrotask` plutôt qu'un appel synchrone : poser un state
      // directement dans le corps d'un effet déclenche des rendus en
      // cascade (règle react-hooks/set-state-in-effect).
      queueMicrotask(() => setUnavailable(true));
      return;
    }
    let cancelled = false;
    loadGoogleIdentity()
      .then((google) => {
        if (cancelled || !containerRef.current) return;
        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => onIdTokenRef.current(response.credential),
        });
        google.accounts.id.renderButton(containerRef.current, {
          theme: "outline",
          size: "large",
          text: "continue_with",
          width: 320,
        });
      })
      .catch(() => setUnavailable(true));
    return () => {
      cancelled = true;
    };
  }, []);

  if (unavailable) return null;
  return <div ref={containerRef} />;
}
