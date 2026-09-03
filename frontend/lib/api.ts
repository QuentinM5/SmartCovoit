/**
 * Client API — point d'entrée réseau unique du frontend. Aucune autre partie
 * de l'app ne doit appeler fetch() directement contre le backend : tout
 * passe par NEXT_PUBLIC_API_URL, configurable, jamais en dur (cf. brief —
 * "une seule URL d'API configurable via variable d'environnement").
 */

import { clearToken, getToken } from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Direction = "ramassage" | "dispersion";

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface AuthResult {
  token: string;
  user: User;
}

export interface Comment {
  id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
}

export interface EventOut {
  id: string;
  name: string;
  depot_address: string;
  depot_lat: number;
  depot_lon: number;
  event_date: string;
  created_at: string;
  /** Nul pour les événements créés avant l'authentification. */
  owner_id: string | null;
  has_cover_image: boolean;
}

export interface Driver {
  id: string;
  name: string;
  seats: number;
  address: string;
  lat: number;
  lon: number;
  direction: Direction;
}

export interface Passenger {
  id: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
  direction: Direction;
}

export interface EventDetail extends EventOut {
  drivers: Driver[];
  passengers: Passenger[];
  comments: Comment[];
}

export interface Stop {
  node: number;
  passenger_id: string | null;
  passenger_name: string | null;
  cumulative_distance_m: number;
  /** Absente si aucune matrice de durées n'a pu être obtenue (repli Haversine). */
  cumulative_duration_s?: number | null;
}

export interface Route {
  driver_id: string;
  driver_name: string;
  distance_m: number;
  duration_s?: number | null;
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
  direction: Direction;
  total_distance_m: number;
  total_duration_s?: number | null;
  matrix_source: "google" | "osrm" | "haversine";
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

/** En-tête `Authorization` plutôt qu'un cookie de session — cf. lib/auth.ts.
 * Absent si personne n'est connecté : les lectures restent publiques,
 * seules les écritures exigeront un jeton côté serveur. */
function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    if (response.status === 401) {
      // Jeton absent, invalide ou expiré : efface la session locale pour
      // que l'UI reflète l'état déconnecté au prochain rendu, plutôt que de
      // laisser un jeton mort qui échouera à chaque appel suivant.
      clearToken();
    }
    const body = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new ApiError(response.status, body?.detail ?? `Erreur ${response.status}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...init?.headers },
  });
  return handleResponse<T>(response);
}

/** Upload multipart — pas de Content-Type explicite : le navigateur pose
 * lui-même l'en-tête avec la bonne frontière pour un FormData. */
async function requestUpload<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { method: "POST", headers: authHeaders(), body: formData });
  return handleResponse<T>(response);
}

/**
 * `lat`/`lon` accompagnent l'adresse quand elle vient d'une suggestion : le
 * serveur les utilise telles quelles au lieu de re-géocoder le libellé, ce qui
 * supprime les confusions entre communes homonymes. Omises, le serveur géocode
 * comme avant.
 */
export interface AddressFields {
  lat?: number | null;
  lon?: number | null;
}

export function createEvent(
  data: { name: string; depot_address: string; event_date: string; id?: string } & AddressFields,
) {
  return request<EventOut>("/events", { method: "POST", body: JSON.stringify(data) });
}

export function getEvent(id: string) {
  return request<EventDetail>(`/events/${id}`);
}

export function addDriver(
  eventId: string,
  data: { name: string; seats: number; address: string; direction: Direction } & AddressFields,
) {
  return request<Driver>(`/events/${eventId}/drivers`, { method: "POST", body: JSON.stringify(data) });
}

export function addPassenger(
  eventId: string,
  data: { name: string; address: string; direction: Direction } & AddressFields,
) {
  return request<Passenger>(`/events/${eventId}/passengers`, { method: "POST", body: JSON.stringify(data) });
}

export function deleteDriver(eventId: string, driverId: string) {
  return request<void>(`/events/${eventId}/drivers/${driverId}`, { method: "DELETE" });
}

export function deletePassenger(eventId: string, passengerId: string) {
  return request<void>(`/events/${eventId}/passengers/${passengerId}`, { method: "DELETE" });
}

export function solveEvent(eventId: string, direction: Direction) {
  return request<Solution>(`/events/${eventId}/solve?direction=${direction}`, { method: "POST" });
}

export function getSolution(eventId: string, direction: Direction) {
  return request<Solution>(`/events/${eventId}/solution?direction=${direction}`);
}

/**
 * Déplace un passager vers une tournée (la sienne ou une autre) après un
 * calcul — `driverId` identique au conducteur actuel du passager recalcule
 * simplement sa meilleure position parmi les arrêts déjà présents. Le
 * serveur choisit la position la moins coûteuse dans la tournée cible ; pas
 * de contrôle de capacité côté serveur (surcapacité tolérée si le client la
 * confirme explicitement — cf. `pendingOvercapacity` dans
 * event-page-client.tsx).
 */
export function moveStop(eventId: string, passengerId: string, driverId: string) {
  return request<Solution>(`/events/${eventId}/solution/move-stop`, {
    method: "POST",
    body: JSON.stringify({ passenger_id: passengerId, driver_id: driverId }),
  });
}

export function signup(data: { email: string; name: string; password: string }) {
  return request<AuthResult>("/auth/signup", { method: "POST", body: JSON.stringify(data) });
}

export function login(data: { email: string; password: string }) {
  return request<AuthResult>("/auth/login", { method: "POST", body: JSON.stringify(data) });
}

/** `idToken` : jeton d'identité renvoyé par Google Identity Services côté
 * client (pas un code d'autorisation) — cf. décision du plan. */
export function loginWithGoogle(idToken: string) {
  return request<AuthResult>("/auth/google", { method: "POST", body: JSON.stringify({ id_token: idToken }) });
}

export function getCurrentUser() {
  return request<User>("/auth/me");
}

export function addComment(eventId: string, body: string) {
  return request<Comment>(`/events/${eventId}/comments`, { method: "POST", body: JSON.stringify({ body }) });
}

export function deleteComment(eventId: string, commentId: string) {
  return request<void>(`/events/${eventId}/comments/${commentId}`, { method: "DELETE" });
}

export function coverImageUrl(eventId: string): string {
  return `${API_URL}/events/${eventId}/cover-image`;
}

export function uploadCoverImage(eventId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return requestUpload<void>(`/events/${eventId}/cover-image`, formData);
}
