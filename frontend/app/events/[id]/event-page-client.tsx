"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Route as RouteIcon } from "lucide-react";
import {
  ApiError,
  addDriver,
  addPassenger,
  deleteDriver,
  deletePassenger,
  getEvent,
  getSolution,
  moveStop,
  solveEvent,
  uploadCoverImage,
  type Direction,
  type Driver,
  type EventDetail,
  type Passenger,
  type Solution,
} from "@/lib/api";
import { useAuth } from "@/components/auth-provider";
import { DirectionPicker } from "@/components/direction";
import { Button, ErrorNote, Header } from "@/components/ui";
import { consumeNewEventSeed } from "@/lib/new-event-seed";
import { networkMessage, moveStopOptimistic } from "@/lib/event-format";
import { resolveStops } from "@/lib/route";
import { usePassengerDrag, type DragInfo } from "@/lib/use-passenger-drag";
import { SolvingProgress } from "@/components/solving-progress";
import { EventHeader } from "./event-header";
import { RosterSection } from "./roster-section";
import { RoutesSection } from "./routes-section";
import { SignupSection } from "./signup-section";
import { LoginPrompt } from "./event-notices";
import type { Role } from "./signup-section";
import type { MapRoute } from "@/components/route-map";

export function EventPageClient({ id }: { id: string }) {
  const { user, loading: authLoading } = useAuth();
  const [event, setEvent] = useState<EventDetail | null>(() => consumeNewEventSeed(id));
  // Capturé une seule fois au montage (useRef n'utilise sa valeur initiale
  // qu'au premier rendu) : sait si cette page vient d'une création tout
  // juste lancée en arrière-plan (cf. app/page.tsx), pour distinguer un 404
  // "l'événement n'existe vraiment pas" d'un 404 "pas encore écrit en base,
  // réessaie sous peu".
  const cameFromSeedRef = useRef(event !== null);
  const creationRetriesRef = useRef(event !== null ? 5 : 0);

  const [viewDirection, setViewDirection] = useState<Direction>("ramassage");
  const viewDirectionRef = useRef(viewDirection);
  useEffect(() => {
    viewDirectionRef.current = viewDirection;
  }, [viewDirection]);

  const [solution, setSolution] = useState<Solution | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [solveError, setSolveError] = useState<string | null>(null);
  const [solving, setSolving] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  // Survoler une tournée dans la liste l'isole sur la carte : avec 4 ou 5
  // véhicules qui se croisent, c'est le seul moyen de suivre un trajet.
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const [pendingOvercapacity, setPendingOvercapacity] = useState<{ info: DragInfo; toDriverId: string } | null>(
    null,
  );

  useEffect(() => {
    if (!pendingOvercapacity) return;
    const timer = setTimeout(() => setPendingOvercapacity(null), 6000);
    return () => clearTimeout(timer);
  }, [pendingOvercapacity]);

  const refresh = useCallback(async () => {
    // Fonction nommée locale plutôt qu'un appel à `refresh` depuis son
    // propre corps : `refresh` (le `useCallback`) référencé à l'intérieur
    // de lui-même n'est pas fiable pour React (valeur potentiellement figée
    // au rendu où le `setTimeout` a été posé) — une fonction qui se
    // rappelle par son propre nom n'a pas ce problème.
    async function attempt(): Promise<void> {
      try {
        setEvent(await getEvent(id));
      } catch (err) {
        if (err instanceof ApiError && err.status === 404 && creationRetriesRef.current > 0) {
          creationRetriesRef.current -= 1;
          setTimeout(attempt, 700);
          return;
        }
        setLoadError(
          cameFromSeedRef.current
            ? "La création de l'événement n'a pas abouti. Réessaie de le créer."
            : networkMessage(err, "Impossible de charger l'événement. Vérifie ta connexion et réessaie."),
        );
        return;
      }
      try {
        setSolution(await getSolution(id, viewDirectionRef.current));
      } catch (err) {
        // 404 = aucun trajet calculé pour l'instant, c'est l'état de départ normal.
        if (!(err instanceof ApiError && err.status === 404)) console.error(err);
      }
    }
    await attempt();
  }, [id]);

  useEffect(() => {
    // Chargement initial depuis l'API externe. La règle vise les états dérivés
    // recalculés en effet ; ici l'effet synchronise bien avec un système
    // extérieur, et tout le reste de la page est piloté par des actions
    // utilisateur (inscription, calcul, bascule de sens) qui rappellent
    // `refresh`/un rechargement de solution explicitement.
    refresh();
  }, [refresh]);

  function handleViewDirectionChange(next: Direction) {
    setViewDirection(next);
    setSolution(null);
    setSolveError(null);
    getSolution(id, next)
      .then(setSolution)
      .catch((err) => {
        if (!(err instanceof ApiError && err.status === 404)) console.error(err);
      });
  }

  /**
   * Mise à jour optimiste : la ligne disparaît de la liste dès le clic sur
   * « Confirmer », avant même que la requête n'atteigne le serveur — la
   * suppression réelle tourne en arrière-plan. En cas d'échec, on remet
   * uniquement la personne retirée (pas tout l'objet `event`), pour ne pas
   * écraser une autre modification optimiste faite entre-temps.
   */
  async function handleRemove(kind: Role, participantId: string) {
    setRosterError(null);
    const removed =
      kind === "driver"
        ? event?.drivers.find((d) => d.id === participantId)
        : event?.passengers.find((p) => p.id === participantId);

    setEvent((current) => {
      if (!current) return current;
      return kind === "driver"
        ? { ...current, drivers: current.drivers.filter((d) => d.id !== participantId) }
        : { ...current, passengers: current.passengers.filter((p) => p.id !== participantId) };
    });
    // Le trajet affiché référence potentiellement ce participant : il n'est
    // plus exact, on repart de l'état « à calculer » plutôt que d'afficher
    // quelque chose de trompeur.
    setSolution(null);

    try {
      if (kind === "driver") await deleteDriver(id, participantId);
      else await deletePassenger(id, participantId);
    } catch (err) {
      if (removed) {
        setEvent((current) => {
          if (!current) return current;
          return kind === "driver"
            ? { ...current, drivers: [...current.drivers, removed as Driver] }
            : { ...current, passengers: [...current.passengers, removed as Passenger] };
        });
      }
      setRosterError(networkMessage(err, "La suppression n'a pas abouti. Réessaie."));
    }
  }

  /**
   * Même principe côté inscription : la ou les personnes apparaissent dans
   * la liste avec un id provisoire dès la soumission du formulaire, avant
   * la réponse du serveur. `refresh()` remplace ensuite ces entrées
   * provisoires par les versions serveur (id définitif) une fois la
   * requête aboutie. `directions` porte un ou deux sens (aller, retour, ou
   * les deux) : une inscription par sens coché, même nom/adresse.
   */
  async function handleAddParticipant(
    role: Role,
    directions: Direction[],
    data: { name: string; seats: number; address: string; lat: number | null; lon: number | null },
  ): Promise<void> {
    const tempIds = directions.map(() => `optimistic-${crypto.randomUUID()}`);

    setEvent((current) => {
      if (!current) return current;
      if (role === "driver") {
        const optimisticDrivers: Driver[] = directions.map((direction, i) => ({
          id: tempIds[i],
          name: data.name,
          seats: data.seats,
          address: data.address,
          lat: data.lat ?? 0,
          lon: data.lon ?? 0,
          direction,
        }));
        return { ...current, drivers: [...current.drivers, ...optimisticDrivers] };
      }
      const optimisticPassengers: Passenger[] = directions.map((direction, i) => ({
        id: tempIds[i],
        name: data.name,
        address: data.address,
        lat: data.lat ?? 0,
        lon: data.lon ?? 0,
        direction,
      }));
      return { ...current, passengers: [...current.passengers, ...optimisticPassengers] };
    });
    // Seul le trajet du sens affiché est potentiellement périmé par cet
    // ajout ; l'autre sens n'est pas concerné.
    if (directions.includes(viewDirectionRef.current)) setSolution(null);

    try {
      await Promise.all(
        directions.map((direction) =>
          role === "driver"
            ? addDriver(id, {
                name: data.name,
                seats: data.seats,
                address: data.address,
                lat: data.lat,
                lon: data.lon,
                direction,
              })
            : addPassenger(id, {
                name: data.name,
                address: data.address,
                lat: data.lat,
                lon: data.lon,
                direction,
              }),
        ),
      );
      await refresh();
    } catch (err) {
      setEvent((current) => {
        if (!current) return current;
        return {
          ...current,
          drivers: current.drivers.filter((d) => !tempIds.includes(d.id)),
          passengers: current.passengers.filter((p) => !tempIds.includes(p.id)),
        };
      });
      throw err;
    }
  }

  async function performMoveStop(info: DragInfo, toDriverId: string) {
    setPendingOvercapacity(null);
    if (!solution) return;
    const previousSolution = solution;
    setSolution((current) => (current ? moveStopOptimistic(current, info.passengerId, toDriverId) : current));

    try {
      setSolution(await moveStop(id, info.passengerId, toDriverId));
    } catch (err) {
      setSolution(previousSolution);
      setSolveError(networkMessage(err, "Le déplacement n'a pas abouti. Réessaie."));
    }
  }

  /**
   * Une dépose qui ferait dépasser la capacité d'une tournée n'est pas
   * appliquée tout de suite : elle attend une confirmation explicite
   * affichée sur cette tournée (cf. RouteLine) plutôt que d'agir en
   * silence — l'utilisateur garde la main sur ce choix.
   */
  function handleMoveStop(info: DragInfo, toDriverId: string) {
    if (!solution || info.fromDriverId === toDriverId) {
      void performMoveStop(info, toDriverId);
      return;
    }
    const targetRoute = solution.routes.find((r) => r.driver_id === toDriverId);
    const targetDriver = event?.drivers.find((d) => d.id === toDriverId);
    const wouldOvercapacity =
      !!targetRoute &&
      !!targetDriver &&
      targetRoute.stops.filter((s) => s.passenger_id).length >= targetDriver.seats;

    if (wouldOvercapacity) {
      setPendingOvercapacity({ info, toDriverId });
      return;
    }
    void performMoveStop(info, toDriverId);
  }

  const { drag, position, hoveredDriverId, startDrag } = usePassengerDrag(handleMoveStop);

  // Sur mobile, le bouton est plus bas dans une page à une seule colonne :
  // sans ça, un calcul rapide peut se terminer avant que la barre soit
  // jamais entrée dans le champ de vision.
  const progressRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (solving) progressRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [solving]);

  async function handleSolve() {
    setSolveError(null);
    setSolving(true);
    try {
      setSolution(await solveEvent(id, viewDirection));
    } catch (err) {
      setSolveError(networkMessage(err, "Le calcul n'a pas abouti. Réessaie dans un instant."));
    } finally {
      setSolving(false);
    }
  }

  const [coverImageError, setCoverImageError] = useState<string | null>(null);
  const [uploadingCoverImage, setUploadingCoverImage] = useState(false);

  async function handleUploadCoverImage(file: File) {
    setCoverImageError(null);
    setUploadingCoverImage(true);
    try {
      await uploadCoverImage(id, file);
      setEvent((current) => (current ? { ...current, has_cover_image: true } : current));
    } catch (err) {
      setCoverImageError(networkMessage(err, "L'image n'a pas pu être envoyée. Réessaie."));
    } finally {
      setUploadingCoverImage(false);
    }
  }

  const viewDrivers = useMemo(
    () => event?.drivers.filter((d) => d.direction === viewDirection) ?? [],
    [event, viewDirection],
  );
  const viewPassengers = useMemo(
    () => event?.passengers.filter((p) => p.direction === viewDirection) ?? [],
    [event, viewDirection],
  );

  const mapRoutes: MapRoute[] = useMemo(() => {
    if (!event || !solution) return [];
    return solution.routes.map((route) => ({
      driverName: route.driver_name,
      stops: resolveStops(route, event),
      geometry: route.geometry,
    }));
  }, [event, solution]);

  if (loadError) {
    return (
      <>
        <Header back />
        <main className="mx-auto w-full max-w-3xl px-5 py-14">
          <ErrorNote>{loadError}</ErrorNote>
        </main>
      </>
    );
  }

  if (!event) {
    return (
      <>
        <Header back />
        <main className="mx-auto w-full max-w-3xl px-5 py-14 text-sm text-muted">Chargement…</main>
      </>
    );
  }

  const totalSeats = viewDrivers.reduce((sum, d) => sum + d.seats, 0);
  const seatsLeft = totalSeats - viewPassengers.length;
  // Calculer/réorganiser les tournées et changer l'image de couverture sont
  // réservés à l'organisateur — sauf pour un événement créé avant
  // l'authentification (owner_id nul), resté ouvert à tout compte connecté,
  // cf. matrice d'autorisation côté backend (routes.py).
  const canManage = !!user && (event.owner_id === null || event.owner_id === user.id);

  return (
    <>
      <Header back />

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-5 py-8 sm:py-12">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-10">
          <EventHeader
            event={event}
            viewDirection={viewDirection}
            canManage={canManage}
            uploadingCoverImage={uploadingCoverImage}
            coverImageError={coverImageError}
            onUploadCoverImage={handleUploadCoverImage}
          />

          {authLoading ? null : user ? (
            <SignupSection defaultDirection={viewDirection} defaultName={user.name} onAdd={handleAddParticipant} />
          ) : (
            <LoginPrompt message="Connecte-toi pour t'inscrire à cet événement." />
          )}

          <DirectionPicker value={viewDirection} onChange={handleViewDirectionChange} />
        </div>

        <RosterSection
          drivers={viewDrivers}
          passengers={viewPassengers}
          seatsLeft={seatsLeft}
          error={rosterError}
          onRemove={handleRemove}
        />

        <section className="flex flex-col gap-4">
          {authLoading ? null : !user ? (
            <LoginPrompt message="Connecte-toi pour calculer les trajets de cet événement." />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Button onClick={handleSolve} disabled={solving || viewDrivers.length === 0 || !canManage}>
                  <RouteIcon className="size-4" strokeWidth={1.75} aria-hidden="true" />
                  {solving ? "Calcul…" : solution ? "Recalculer les trajets" : "Calculer les trajets"}
                </Button>
                {!canManage ? (
                  <p className="text-sm text-muted">Seul l&apos;organisateur peut calculer les trajets.</p>
                ) : (
                  viewDrivers.length === 0 && (
                    <p className="text-sm text-muted">Il faut au moins un conducteur inscrit sur ce trajet.</p>
                  )
                )}
              </div>

              {solving && (
                <div ref={progressRef}>
                  <SolvingProgress driverCount={viewDrivers.length} passengerCount={viewPassengers.length} />
                </div>
              )}

              {solveError && <ErrorNote>{solveError}</ErrorNote>}
            </>
          )}
        </section>

        {solution && event && (
          <RoutesSection
            solution={solution}
            event={event}
            mapRoutes={mapRoutes}
            highlighted={highlighted}
            onHoverChange={setHighlighted}
            canManage={canManage}
            onPassengerDragStart={startDrag}
            hoveredDriverId={hoveredDriverId}
            draggingPassengerId={drag?.passengerId ?? null}
            pendingOvercapacityDriverId={pendingOvercapacity?.toDriverId ?? null}
            onConfirmOvercapacity={() => {
              if (pendingOvercapacity) void performMoveStop(pendingOvercapacity.info, pendingOvercapacity.toDriverId);
            }}
            onCancelOvercapacity={() => setPendingOvercapacity(null)}
          />
        )}
      </main>

      {drag && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-medium shadow-lg"
          style={{ left: position.x, top: position.y }}
        >
          {drag.passengerName}
        </div>
      )}
    </>
  );
}
