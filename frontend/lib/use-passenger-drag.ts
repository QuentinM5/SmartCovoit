"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface DragInfo {
  passengerId: string;
  passengerName: string;
  fromDriverId: string;
}

/** Valeurs extraites d'un événement pointeur, pour démarrer un glisser
 * même après un délai (setTimeout) — cf. startDrag ci-dessous. */
export interface DragStartParams {
  target: HTMLElement;
  pointerId: number;
  clientX: number;
  clientY: number;
}

interface DragPosition {
  x: number;
  y: number;
}

// Zone en haut/bas de l'écran où le glisser fait défiler la page — sinon
// impossible d'atteindre une tournée hors écran en glissant sur mobile.
const EDGE_ZONE_PX = 72;
const MAX_SCROLL_SPEED_PX = 18; // par frame, à la toute bordure

function edgeScrollSpeed(pointerY: number): number {
  const viewportHeight = window.innerHeight;
  if (pointerY < EDGE_ZONE_PX) {
    const proximity = Math.min(1, Math.max(0, (EDGE_ZONE_PX - pointerY) / EDGE_ZONE_PX));
    return -MAX_SCROLL_SPEED_PX * proximity;
  }
  if (pointerY > viewportHeight - EDGE_ZONE_PX) {
    const proximity = Math.min(1, Math.max(0, (pointerY - (viewportHeight - EDGE_ZONE_PX)) / EDGE_ZONE_PX));
    return MAX_SCROLL_SPEED_PX * proximity;
  }
  return 0;
}

/**
 * Glisser-déposer par Pointer Events plutôt que l'API HTML5 Drag and Drop :
 * cette dernière ne fonctionne pas au toucher (Safari/Chrome mobile), or
 * c'est la plateforme la plus soignée de l'app — un seul mécanisme, souris
 * et tactile confondus, plutôt que deux interactions différentes à
 * maintenir.
 *
 * La tournée survolée est détectée par `elementFromPoint` + un attribut
 * `data-driver-id` posé sur chaque carte de tournée, plutôt qu'une liste de
 * refs à tenir à jour manuellement.
 */
export function usePassengerDrag(onDrop: (info: DragInfo, toDriverId: string) => void) {
  const [drag, setDrag] = useState<DragInfo | null>(null);
  const [position, setPosition] = useState<DragPosition>({ x: 0, y: 0 });
  const [hoveredDriverId, setHoveredDriverId] = useState<string | null>(null);

  // Miroir synchrone de l'état React, lu au pointerup : le handler est
  // attaché sur `document` pour tout le geste, `onDrop` ne doit pas
  // dépendre de la fraîcheur d'un re-rendu React déclenché juste avant.
  const onDropRef = useRef(onDrop);
  useEffect(() => {
    onDropRef.current = onDrop;
  }, [onDrop]);
  const liveRef = useRef<{ info: DragInfo; hoveredDriverId: string | null } | null>(null);
  // Dernière position Y connue du pointeur, lue par la boucle de défilement
  // automatique — indépendante du re-rendu React (la boucle tourne même si
  // le pointeur reste immobile près d'un bord).
  const pointerYRef = useRef(0);

  // Valeurs déjà extraites plutôt que l'événement React brut : nécessaire
  // pour pouvoir démarrer le glisser après un délai (`setTimeout`, cf.
  // route-line.tsx sur tactile) — React remet `event.currentTarget` à
  // `null` une fois le gestionnaire synchrone qui l'a reçu terminé, une
  // référence DOM capturée immédiatement ne l'est pas.
  const startDrag = useCallback(
    (params: DragStartParams, info: DragInfo) => {
      params.target.setPointerCapture(params.pointerId);
      liveRef.current = { info, hoveredDriverId: null };
      pointerYRef.current = params.clientY;
      setDrag(info);
      setPosition({ x: params.clientX, y: params.clientY });
      setHoveredDriverId(null);
    },
    [],
  );

  useEffect(() => {
    if (!drag) return;

    function onMove(e: PointerEvent) {
      pointerYRef.current = e.clientY;
      setPosition({ x: e.clientX, y: e.clientY });
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-driver-id]");
      const id = target?.dataset.driverId ?? null;
      setHoveredDriverId(id);
      if (liveRef.current) liveRef.current.hoveredDriverId = id;
    }

    function finish() {
      const live = liveRef.current;
      liveRef.current = null;
      setDrag(null);
      setHoveredDriverId(null);
      if (live?.hoveredDriverId) {
        onDropRef.current(live.info, live.hoveredDriverId);
      }
    }

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", finish);

    // Boucle continue plutôt que déclenchée par pointermove : il faut
    // continuer à défiler même si le doigt reste immobile juste au bord.
    let raf = requestAnimationFrame(function autoScroll() {
      const speed = edgeScrollSpeed(pointerYRef.current);
      if (speed !== 0) window.scrollBy(0, speed);
      raf = requestAnimationFrame(autoScroll);
    });

    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", finish);
      cancelAnimationFrame(raf);
    };
  }, [drag]);

  return { drag, position, hoveredDriverId, startDrag };
}
