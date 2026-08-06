/**
 * Client API — point d'entrée réseau unique du frontend. Aucune autre partie
 * de l'app ne doit appeler fetch() directement contre le backend : tout
 * passe par NEXT_PUBLIC_API_URL, configurable, jamais en dur (cf. brief —
 * "une seule URL d'API configurable via variable d'environnement").
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Direction = "ramassage" | "dispersion";

export interface EventOut {
  id: string;
  name: string;
  direction: Direction;
  depot_address: string;
  depot_lat: number;
  depot_lon: number;
  created_at: string;
}

export interface Driver {
  id: string;
  name: string;
  seats: number;
  address: string;
  lat: number;
  lon: number;
}

export interface Passenger {
  id: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
}

export interface EventDetail extends EventOut {
  drivers: Driver[];
  passengers: Passenger[];
}

export interface Stop {
  node: number;
  passenger_id: string | null;
  passenger_name: string | null;
  cumulative_distance_m: number;
}

export interface Route {
  driver_id: string;
  driver_name: string;
  distance_m: number;
  stops: Stop[];
  /**
   * Tracé routier réel, suite de points [lat, lon]. Absent quand OSRM n'est pas
   * disponible (ou pour une solution calculée avant l'ajout de ce champ) : la
   * carte relie alors les arrêts en ligne droite.
   */
  geometry?: number[][] | null;
}

export interface Solution {
  id: string;
  event_id: string;
  total_distance_m: number;
  matrix_source: "osrm" | "haversine";
  fallback_reason: string | null;
  routes: Route[];
  created_at: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(response.status, body?.detail ?? `Erreur ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export function createEvent(data: { name: string; direction: Direction; depot_address: string }) {
  return request<EventOut>("/events", { method: "POST", body: JSON.stringify(data) });
}

export function getEvent(id: string) {
  return request<EventDetail>(`/events/${id}`);
}

export function addDriver(eventId: string, data: { name: string; seats: number; address: string }) {
  return request<Driver>(`/events/${eventId}/drivers`, { method: "POST", body: JSON.stringify(data) });
}

export function addPassenger(eventId: string, data: { name: string; address: string }) {
  return request<Passenger>(`/events/${eventId}/passengers`, { method: "POST", body: JSON.stringify(data) });
}

export function solveEvent(eventId: string) {
  return request<Solution>(`/events/${eventId}/solve`, { method: "POST" });
}

export function getSolution(eventId: string) {
  return request<Solution>(`/events/${eventId}/solution`);
}
