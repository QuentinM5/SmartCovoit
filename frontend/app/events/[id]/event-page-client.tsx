"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Car, Route as RouteIcon, User } from "lucide-react";
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
  type Direction,
  type Driver,
  type EventDetail,
  type Passenger,
  type Route,
  type Solution,
} from "@/lib/api";
import { DirectionCheckboxes, DirectionGlyph, DirectionPicker } from "@/components/direction";
import { AddressInput, needsSelection, type AddressValue } from "@/components/address-input";
import { CopyLinkButton } from "@/components/copy-link-button";
import { DeleteButton } from "@/components/delete-button";
import { RouteLine } from "@/components/route-line";
import { RouteMap, type MapRoute } from "@/components/route-map";
import { SolvingProgress } from "@/components/solving-progress";
import { Button, ErrorNote, Field, Header, inputClass } from "@/components/ui";
import { consumeNewEventSeed } from "@/lib/new-event-seed";
import { formatDistance, formatDuration, resolveStops } from "@/lib/route";
import { usePassengerDrag, type DragInfo } from "@/lib/use-passenger-drag";

type Role = "driver" | "passenger";

function networkMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  return fallback;
}

/**
 * Déplace structurellement un arrêt passager d'une tournée à une autre
 * (aperçu optimiste) : le dernier arrêt de chaque tournée est toujours le
 * dépôt ou le domicile du conducteur (cf. solveur), on l'y laisse plutôt
 * que d'en faire la destination du lien Maps par erreur.
 */
function moveStopOptimistic(solution: Solution, passengerId: string, toDriverId: string): Solution {
  let movedStop: Route["stops"][number] | null = null;
  const withoutPassenger = solution.routes.map((route) => {
    const stop = route.stops.find((s) => s.passenger_id === passengerId);
    if (!stop) return route;
    movedStop = stop;
    return { ...route, stops: route.stops.filter((s) => s.passenger_id !== passengerId) };
  });
  if (!movedStop) return solution;
  const stopToInsert: Route["stops"][number] = movedStop;

  return {
    ...solution,
    routes: withoutPassenger.map((route) => {
      if (route.driver_id !== toDriverId) return route;
      const boundary = route.stops[route.stops.length - 1];
      return { ...route, stops: [...route.stops.slice(0, -1), stopToInsert, boundary] };
    }),
  };
}

export function EventPageClient({ id }: { id: string }) {
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

  const dispersion = viewDirection === "dispersion";
  const totalSeats = viewDrivers.reduce((sum, d) => sum + d.seats, 0);
  const seatsLeft = totalSeats - viewPassengers.length;

  return (
    <>
      <Header back />

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-5 py-8 sm:py-12">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-10">
          <section>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <DirectionGlyph
                  direction={viewDirection}
                  className={`mt-1 h-10 w-14 shrink-0 ${dispersion ? "text-outbound" : "text-inbound"}`}
                />
                <div className="min-w-0">
                  <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{event.name}</h1>
                  <p className="mt-1 text-sm text-muted">
                    {dispersion ? "Retour depuis" : "Aller vers"}{" "}
                    <span className="text-ink">{event.depot_address}</span>
                  </p>
                </div>
              </div>
              <CopyLinkButton className="mt-1" />
            </div>
          </section>

          <DirectionPicker value={viewDirection} onChange={handleViewDirectionChange} />

          <SignupSection defaultDirection={viewDirection} onAdd={handleAddParticipant} />
        </div>

        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-sm font-semibold tracking-tight">Inscrits</h2>
            <p className="tabular text-sm text-muted">
              {viewDrivers.length} {viewDrivers.length > 1 ? "conducteurs" : "conducteur"}
              <span aria-hidden="true"> · </span>
              {viewPassengers.length} {viewPassengers.length > 1 ? "passagers" : "passager"}
              {viewDrivers.length > 0 && (
                <>
                  <span aria-hidden="true"> · </span>
                  <span className={seatsLeft < 0 ? "text-danger" : ""}>
                    {seatsLeft < 0
                      ? `${-seatsLeft} de trop`
                      : `${seatsLeft} ${seatsLeft > 1 ? "places libres" : "place libre"}`}
                  </span>
                </>
              )}
            </p>
          </div>

          {viewDrivers.length === 0 && viewPassengers.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              Personne pour l&apos;instant sur ce trajet. Partage l&apos;adresse de cette page au groupe.
            </p>
          ) : (
            <>
              {viewDrivers.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium tracking-wide text-muted">
                    Conducteurs · {viewDrivers.length}
                  </p>
                  <ul className="mt-1.5 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                    {viewDrivers.map((d) => (
                      <li
                        key={d.id}
                        className="flex items-baseline gap-3 rounded-md border border-line px-3 py-2.5 text-sm"
                      >
                        <Car className="size-4 shrink-0 translate-y-0.5 text-muted" strokeWidth={1.75} />
                        <span className="font-medium">{d.name}</span>
                        <span className="min-w-0 flex-1 truncate text-muted">{d.address}</span>
                        <span className="tabular shrink-0 font-mono text-xs text-muted">
                          {d.seats} {d.seats > 1 ? "places" : "place"}
                        </span>
                        <DeleteButton label={d.name} onConfirm={() => handleRemove("driver", d.id)} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {viewPassengers.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium tracking-wide text-muted">
                    Passagers · {viewPassengers.length}
                  </p>
                  <ul className="mt-1.5 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                    {viewPassengers.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-baseline gap-3 rounded-md border border-line px-3 py-2.5 text-sm"
                      >
                        <User className="size-4 shrink-0 translate-y-0.5 text-muted" strokeWidth={1.75} />
                        <span className="font-medium">{p.name}</span>
                        <span className="min-w-0 flex-1 truncate text-muted">{p.address}</span>
                        <DeleteButton label={p.name} onConfirm={() => handleRemove("passenger", p.id)} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
          {rosterError && <ErrorNote>{rosterError}</ErrorNote>}
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button onClick={handleSolve} disabled={solving || viewDrivers.length === 0}>
              <RouteIcon className="size-4" strokeWidth={1.75} aria-hidden="true" />
              {solving ? "Calcul…" : solution ? "Recalculer les trajets" : "Calculer les trajets"}
            </Button>
            {viewDrivers.length === 0 && (
              <p className="text-sm text-muted">Il faut au moins un conducteur inscrit sur ce trajet.</p>
            )}
          </div>

          {solving && (
            <div ref={progressRef}>
              <SolvingProgress driverCount={viewDrivers.length} passengerCount={viewPassengers.length} />
            </div>
          )}

          {solveError && <ErrorNote>{solveError}</ErrorNote>}
        </section>

        {solution && event && (
          <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="text-sm font-semibold tracking-tight">Trajets</h2>
              <p className="tabular text-sm text-muted">
                {solution.total_duration_s != null ? (
                  <>
                    <span className="font-mono text-ink">
                      {formatDuration(solution.total_duration_s)}
                    </span>{" "}
                    ·{" "}
                    <span className="font-mono">{formatDistance(solution.total_distance_m)}</span> au
                    total
                  </>
                ) : (
                  <>
                    <span className="font-mono">{formatDistance(solution.total_distance_m)}</span> au
                    total
                  </>
                )}
              </p>
            </div>

            <SourceBanner source={solution.matrix_source} />

            <RouteMap routes={mapRoutes} highlightedRoute={highlighted} />

            <div className="grid gap-3 lg:grid-cols-2">
              {solution.routes.map((route, index) => {
                const driver = event.drivers.find((d) => d.id === route.driver_id);
                return (
                  <RouteLine
                    key={route.driver_id}
                    driverId={route.driver_id}
                    index={index}
                    driverName={route.driver_name}
                    seats={driver?.seats ?? 0}
                    distanceM={route.distance_m}
                    durationS={route.duration_s}
                    stops={mapRoutes[index]?.stops ?? []}
                    onHoverChange={(active) => setHighlighted(active ? index : null)}
                    onPassengerDragStart={startDrag}
                    isDropTarget={hoveredDriverId === route.driver_id}
                    draggingPassengerId={drag?.passengerId ?? null}
                    pendingOvercapacity={pendingOvercapacity?.toDriverId === route.driver_id}
                    onConfirmOvercapacity={() => {
                      if (pendingOvercapacity) void performMoveStop(pendingOvercapacity.info, pendingOvercapacity.toDriverId);
                    }}
                    onCancelOvercapacity={() => setPendingOvercapacity(null)}
                  />
                );
              })}
            </div>
          </section>
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

/**
 * Le critère d'optimisation dépend de ce qui a pu être obtenu pour ce
 * trajet (repli transparent, cf. FallbackMatrixProvider côté backend) : le
 * bandeau reflète honnêtement ce niveau plutôt que de laisser croire que
 * c'est toujours le trafic en temps réel qui a été optimisé.
 */
function SourceBanner({ source }: { source: Solution["matrix_source"] }) {
  if (source === "google") {
    return (
      <p className="rounded-md border border-line bg-surface px-3 py-2 text-xs leading-relaxed text-muted">
        Trajets optimisés sur le temps de trajet en tenant compte du trafic en temps réel.
      </p>
    );
  }
  if (source === "osrm") {
    return (
      <p className="rounded-md border border-line bg-surface px-3 py-2 text-xs leading-relaxed text-muted">
        Trajets optimisés sur le temps de trajet typique (hors trafic en temps réel).
      </p>
    );
  }
  return (
    <p className="rounded-md border border-line bg-surface px-3 py-2 text-xs leading-relaxed text-muted">
      Distances estimées à vol d&apos;oiseau : le service de routage n&apos;était pas joignable.
      L&apos;ordre de passage reste valable, les kilomètres sont approximatifs et la carte relie
      les arrêts en pointillé plutôt que par la route.
    </p>
  );
}

/**
 * Le conducteur ne « se dépose » pas lui-même : son adresse est un point de
 * son propre trajet (départ ou retour), pas une dépose faite par quelqu'un
 * d'autre. Une personne inscrite aux deux sens à la fois donne une seule
 * adresse qui sert aux deux rôles.
 */
function addressCopy(role: Role, directions: Direction[]): { label: string; hint: string } {
  const wantsAller = directions.includes("ramassage");
  const wantsRetour = directions.includes("dispersion");

  if (wantsAller && wantsRetour) {
    return role === "driver"
      ? { label: "Ton adresse", hint: "D'où tu pars à l'aller, où tu rentres au retour." }
      : { label: "Ton adresse", hint: "Où on te prend à l'aller, où on te dépose au retour." };
  }
  if (wantsRetour) {
    return role === "driver"
      ? { label: "Adresse d'arrivée", hint: "Où tu rentres." }
      : { label: "Adresse d'arrivée", hint: "Où on te dépose." };
  }
  return role === "driver"
    ? { label: "Adresse de départ", hint: "D'où tu pars." }
    : { label: "Adresse de départ", hint: "D'où on te prend." };
}

function SignupSection({
  defaultDirection,
  onAdd,
}: {
  defaultDirection: Direction;
  onAdd: (
    role: Role,
    directions: Direction[],
    data: { name: string; seats: number; address: string; lat: number | null; lon: number | null },
  ) => Promise<void>;
}) {
  const [role, setRole] = useState<Role>("passenger");
  const [directions, setDirections] = useState<Direction[]>([defaultDirection]);
  const [name, setName] = useState("");
  const [seats, setSeats] = useState(3);
  const [address, setAddress] = useState<AddressValue>({ address: "", lat: null, lon: null });
  const [addressAvailable, setAddressAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { label: addressLabel, hint: addressHint } = addressCopy(role, directions);
  const addressIncomplete = needsSelection(address, addressAvailable);
  const canSubmit = !addressIncomplete && directions.length > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);

    const entry = { name, seats, address: address.address, lat: address.lat, lon: address.lon };
    // Le formulaire se vide tout de suite : la personne apparaît déjà dans
    // la liste « Inscrits » ci-dessous (mise à jour optimiste côté parent),
    // pas besoin d'attendre le serveur pour rendre la main.
    setName("");
    setAddress({ address: "", lat: null, lon: null });
    setSeats(3);

    try {
      await onAdd(role, directions, entry);
    } catch (err) {
      setError(
        networkMessage(err, "L'inscription n'a pas abouti. Vérifie l'adresse et réessaie."),
      );
    }
  }

  return (
    <section data-surface className="rounded-lg border border-line bg-surface p-4 sm:p-5">
      <h2 className="text-sm font-semibold tracking-tight">S&apos;inscrire</h2>

      <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-4">
        <fieldset>
          <legend className="sr-only">Je participe comme</legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { value: "passenger", label: "Passager", Icon: User },
                { value: "driver", label: "Conducteur", Icon: Car },
              ] as const
            ).map(({ value, label, Icon }) => {
              const selected = role === value;
              return (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-inbound ${
                    selected
                      ? "border-ink bg-ink text-paper"
                      : "border-line text-muted hover:border-muted"
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={value}
                    checked={selected}
                    onChange={() => setRole(value)}
                    className="sr-only"
                  />
                  <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
                  {label}
                </label>
              );
            })}
          </div>
        </fieldset>

        <DirectionCheckboxes value={directions} onChange={setDirections} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Prénom"
              className={inputClass}
            />
          </Field>

          {role === "driver" && (
            <Field label="Places passagers" hint="Sans compter la tienne.">
              <input
                required
                type="number"
                inputMode="numeric"
                min={1}
                max={20}
                value={seats}
                onChange={(e) => setSeats(Number(e.target.value))}
                className={`${inputClass} tabular font-mono`}
              />
            </Field>
          )}
        </div>

        <Field label={addressLabel} hint={addressHint}>
          <AddressInput
            required
            value={address}
            onChange={setAddress}
            onAvailabilityChange={setAddressAvailable}
            placeholder="Commence à taper une adresse…"
          />
        </Field>

        {error && <ErrorNote>{error}</ErrorNote>}

        <div>
          <Button type="submit" variant="quiet" disabled={!canSubmit}>
            M&apos;inscrire
          </Button>
        </div>
      </form>
    </section>
  );
}
