"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "smartcovoit-theme";

/**
 * Le thème vit sur `<html>` (posé avant le premier rendu par le script du
 * layout, pour éviter le flash au chargement). C'est donc un état externe à
 * React, qu'on lit via useSyncExternalStore plutôt qu'en copiant la valeur
 * dans un state au montage.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function isDark() {
  return document.documentElement.classList.contains("dark");
}

// Le serveur ne connaît pas la préférence : on rend l'état clair, corrigé dès
// l'hydratation.
function isDarkOnServer() {
  return false;
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, isDark, isDarkOnServer);

  function toggle() {
    const next = !isDark();
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    listeners.forEach((l) => l());
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Passer en mode clair" : "Passer en mode sombre"}
      className="grid size-9 place-items-center rounded-full border border-line text-muted transition hover:border-ink hover:text-ink"
    >
      {dark ? (
        <Sun className="size-4" strokeWidth={1.75} aria-hidden="true" />
      ) : (
        <Moon className="size-4" strokeWidth={1.75} aria-hidden="true" />
      )}
    </button>
  );
}
