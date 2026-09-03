"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Link as LinkIcon } from "lucide-react";
import { capture } from "@/lib/telemetry";

const CONFIRM_DURATION_MS = 2000;

/**
 * L'app n'a pas de compte utilisateur : le lien de la page EST le mécanisme
 * de partage. Confirmation inline (même esprit que `DeleteButton`) plutôt
 * qu'un toast — cohérent avec le reste de l'app, pas de dépendance en plus.
 */
export function CopyLinkButton({ className }: { className?: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function handleCopy() {
    capture("link_copied", { path: window.location.pathname });
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      // Contexte non sécurisé ou permission refusée : on retombe sur un
      // prompt natif (sélection manuelle) plutôt qu'un échec silencieux.
      window.prompt("Copie ce lien :", window.location.href);
      return;
    }
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), CONFIRM_DURATION_MS);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium transition hover:border-ink ${className ?? ""}`}
    >
      {copied ? (
        <>
          <Check className="size-3.5 text-inbound" strokeWidth={1.75} aria-hidden="true" />
          Copié !
        </>
      ) : (
        <>
          <LinkIcon className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
          Copier le lien
        </>
      )}
    </button>
  );
}
