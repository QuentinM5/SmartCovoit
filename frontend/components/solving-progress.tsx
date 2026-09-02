"use client";

import { useEffect, useState } from "react";

// Le calcul (OR-Tools + réseau) prend typiquement quelques secondes, sans
// borne exacte connue côté client. Une barre déterministe mentirait ; une
// barre indéterminée (spinner) donne moins de sensation de progrès qu'une
// barre qui avance — la littérature UX est constante là-dessus depuis les
// études de Myers (1985) sur les barres de progression. Compromis : une
// courbe qui monte vite puis ralentit sans jamais atteindre 100 % avant la
// vraie réponse, pour ne jamais paraître "figée".
const TAU_MS = 3500;
const MAX_PERCENT = 92;

function phrasesFor(driverCount: number, passengerCount: number): string[] {
  return [
    "Récupération des temps de trajet…",
    `Optimisation des trajets pour ${driverCount} ${driverCount > 1 ? "conducteurs" : "conducteur"}…`,
    `Répartition de ${passengerCount} ${passengerCount > 1 ? "passagers" : "passager"}…`,
    "Dernières vérifications…",
  ];
}

/**
 * Affichée pendant le calcul des tournées. Montre ce qui se passe (pas
 * juste "ça charge") : ça donne un sentiment de progrès réel plutôt que
 * décoratif, et réduit l'attente perçue (visibilité de l'état du système,
 * heuristique de Nielsen n°1).
 */
export function SolvingProgress({
  driverCount,
  passengerCount,
}: {
  driverCount: number;
  passengerCount: number;
}) {
  const [percent, setPercent] = useState(0);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const phrases = phrasesFor(driverCount, passengerCount);

  useEffect(() => {
    const start = performance.now();
    let raf: number;
    const tick = () => {
      const elapsed = performance.now() - start;
      setPercent(MAX_PERCENT * (1 - Math.exp(-elapsed / TAU_MS)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setPhraseIndex((i) => Math.min(i + 1, phrases.length - 1));
    }, 1800);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex max-w-sm flex-col gap-2">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div
          // Pas de transition CSS ici : `percent` est déjà interpolé à 60
          // im/s par requestAnimationFrame ci-dessus. Une transition en plus
          // sur la même propriété fait courir deux animations après la même
          // cible à la fois, ce qui ralentit/lisse le rendu réel par rapport
          // à la courbe calculée — plus sensible sur un CPU mobile.
          className="h-full rounded-full bg-ink"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="tabular text-sm text-muted">{phrases[phraseIndex]}</p>
    </div>
  );
}
