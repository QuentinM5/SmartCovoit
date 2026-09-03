/**
 * Calculateur de partage des frais — barème auto ajustable par l'organisateur
 * (cf. Event.fuel_price_per_l / consumption_l_per_100km), calcul côté client
 * à partir de la distance déjà renvoyée par le solveur.
 *
 * Défauts identiques à ceux du backend (Settings.default_fuel_price_per_l /
 * default_consumption_l_per_100km) : appliqués ici seulement quand
 * l'organisateur n'a jamais personnalisé le barème (valeurs nulles côté
 * API), pour que tous les participants d'un même événement voient le même
 * montant sans avoir à interroger le serveur pour connaître le défaut.
 */

export const DEFAULT_FUEL_PRICE_PER_L = 1.75;
export const DEFAULT_CONSUMPTION_L_PER_100KM = 6.5;

export interface CostParams {
  fuelPricePerL: number | null;
  consumptionLPer100Km: number | null;
}

export function routeCostEuros(distanceM: number, params: CostParams): number {
  const pricePerL = params.fuelPricePerL ?? DEFAULT_FUEL_PRICE_PER_L;
  const consumption = params.consumptionLPer100Km ?? DEFAULT_CONSUMPTION_L_PER_100KM;
  return (distanceM / 1000) * (consumption / 100) * pricePerL;
}

/** Répartition équitable : le conducteur paie sa part du trajet qu'il
 * aurait fait de toute façon, il compte donc pour une part comme les
 * passagers qu'il transporte. */
export function splitPerPersonEuros(totalEuros: number, passengerCount: number): number {
  return totalEuros / (passengerCount + 1);
}

/** Devise appliquée quand l'organisateur n'en a jamais choisi une (colonne
 * `events.currency` nulle) — cf. schemas.Currency côté backend, même liste. */
export const DEFAULT_CURRENCY = "EUR";
export const CURRENCIES = ["EUR", "CAD", "USD", "CHF", "GBP"] as const;
export type Currency = (typeof CURRENCIES)[number];

export function formatMoney(value: number, currency: string | null): string {
  return value.toLocaleString("fr-CA", { style: "currency", currency: currency ?? DEFAULT_CURRENCY });
}
