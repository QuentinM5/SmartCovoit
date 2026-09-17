/**
 * Tests de lib/nearby.ts — fonction pure, aucun DOM ni réseau nécessaire.
 * Mêmes coordonnées que backend/tests/test_meetup_clustering.py : les deux
 * suites parlent des mêmes points, ce qui permet de vérifier que les deux
 * implémentations (backend Python, frontend TS) s'accordent.
 */
import { describe, expect, it } from "vitest";
import { groupNearbyParticipants, type NearbyMember } from "@/lib/nearby";

function member(id: string, lat: number, lon: number, role: NearbyMember["role"] = "passenger"): NearbyMember {
  return { id, name: id, role, lat, lon };
}

// Trois points à Montréal, très proches les uns des autres.
const NEAR_A = member("a", 45.5017, -73.5673);
const NEAR_B = member("b", 45.504, -73.57);
const NEAR_C = member("c", 45.501, -73.565);
// À Québec, loin de tout ce qui précède (> 200 km).
const FAR = member("far", 46.8139, -71.208);

describe("groupNearbyParticipants", () => {
  it("regroupe trois points proches en un seul groupe", () => {
    const groups = groupNearbyParticipants([NEAR_A, NEAR_B, NEAR_C]);
    expect(groups).toHaveLength(1);
    expect(new Set(groups[0].map((m) => m.id))).toEqual(new Set(["a", "b", "c"]));
  });

  it("ignore un point isolé lointain", () => {
    const groups = groupNearbyParticipants([NEAR_A, NEAR_B, FAR]);
    expect(groups).toHaveLength(1);
    expect(new Set(groups[0].map((m) => m.id))).toEqual(new Set(["a", "b"]));
  });

  it("ne renvoie aucun groupe pour un tableau vide", () => {
    expect(groupNearbyParticipants([])).toEqual([]);
  });

  it("respecte un rayon personnalisé", () => {
    // NEAR_A et NEAR_B sont à plus de 200 m mais moins de 2 km l'un de
    // l'autre : un rayon de 100 m ne doit pas les regrouper.
    expect(groupNearbyParticipants([NEAR_A, NEAR_B], 100)).toEqual([]);
  });

  it("écarte les membres sans coordonnées utilisables (0,0)", () => {
    // Une inscription optimiste non géocodée (cf. handleAddParticipant)
    // arrive avec lat: 0, lon: 0 : elle ne doit jamais fabriquer un faux
    // groupe avec un vrai inscrit proche de (0,0) par coïncidence.
    const zero = member("zero", 0, 0);
    const groups = groupNearbyParticipants([NEAR_A, NEAR_B, zero]);
    expect(groups).toHaveLength(1);
    expect(new Set(groups[0].map((m) => m.id))).toEqual(new Set(["a", "b"]));
  });
});
