"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";

const CONFIRM_TIMEOUT_MS = 4000;
const PANEL_WIDTH_CLASS = "w-32";

/**
 * Confirmation de suppression, en ligne plutôt qu'en modale : une modale
 * plein écran pour retirer une ligne de liste serait plus lourde que
 * l'action elle-même.
 *
 * La croix et le panneau rouge restent tous les deux montés en permanence —
 * seule la largeur du panneau (ancré à droite, comme la croix qu'il
 * recouvre) est animée. Ouverture et fermeture utilisent donc exactement la
 * même transition, symétrique, plutôt qu'un remplacement instantané d'un
 * état par l'autre au milieu du mouvement. Pas d'écouteur de clic extérieur :
 * l'auto-fermeture après 4 s en tient lieu.
 */
export function DeleteButton({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function open() {
    setConfirming(true);
    timerRef.current = setTimeout(() => setConfirming(false), CONFIRM_TIMEOUT_MS);
  }

  function confirm() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setConfirming(false);
    onConfirm();
  }

  return (
    <span className="relative inline-flex h-7 shrink-0 items-center">
      <button
        type="button"
        aria-label={`Retirer ${label}`}
        tabIndex={confirming ? -1 : 0}
        onClick={open}
        className="rounded p-1 text-muted transition hover:text-danger"
      >
        <X className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
      </button>

      <span
        aria-hidden={!confirming}
        className={`absolute inset-y-0 right-0 overflow-hidden rounded transition-[width] duration-300 ease-out ${
          confirming ? PANEL_WIDTH_CLASS : "w-0"
        }`}
      >
        <button
          type="button"
          tabIndex={confirming ? 0 : -1}
          onClick={confirm}
          className={`flex h-full ${PANEL_WIDTH_CLASS} items-center justify-center gap-1.5 whitespace-nowrap bg-danger px-3 text-xs font-medium text-paper transition hover:opacity-90`}
        >
          <Check className="size-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
          Confirmer
        </button>
      </span>
    </span>
  );
}
