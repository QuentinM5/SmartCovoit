"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

/**
 * Confirmation de suppression, en ligne plutôt qu'en modale : une modale
 * plein écran pour retirer une ligne de liste serait plus lourde que
 * l'action elle-même. Le bouton se change brièvement en « Confirmer ? »,
 * et revient tout seul à l'état normal après quelques secondes sans
 * réponse — pas besoin d'écouteur global pour un clic à l'extérieur.
 */
export function DeleteButton({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (confirming) {
    return (
      <span className="inline-flex shrink-0 items-center gap-2 text-xs">
        <span className="text-muted">Supprimer ?</span>
        <button
          type="button"
          onClick={() => {
            if (timerRef.current) clearTimeout(timerRef.current);
            setConfirming(false);
            onConfirm();
          }}
          className="font-medium text-outbound hover:underline"
        >
          Oui
        </button>
        <button
          type="button"
          onClick={() => {
            if (timerRef.current) clearTimeout(timerRef.current);
            setConfirming(false);
          }}
          className="text-muted hover:underline"
        >
          Annuler
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-label={`Retirer ${label}`}
      onClick={() => {
        setConfirming(true);
        timerRef.current = setTimeout(() => setConfirming(false), 4000);
      }}
      className="shrink-0 rounded p-1 text-muted transition hover:text-outbound"
    >
      <X className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}
