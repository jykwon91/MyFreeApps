/**
 * Where a fact on a WoW Forever page comes from — the one provenance scale every
 * page uses. Wording is `PROVENANCE_LABEL` / `PROVENANCE_DESCRIPTION`
 * (`data/provenance/provenanceLabels.ts`); the badge is `ProvenanceBadge`.
 * - `seen`: seen in the live game (a dated in-game capture). Server-side facts
 *   (spawns, vendors, quest givers) can only be `seen`, `classic` or `unconfirmed`.
 * - `published`: stated by the Forever team (patch notes, an official post).
 * - `client`: read from the Forever game files (the client's own tables).
 * - `classic`: true in Classic Era; Forever may differ.
 * - `unconfirmed`: nobody has checked it in Forever yet (beta reports included).
 */
export const PROVENANCE = {
  seen: "seen",
  published: "published",
  client: "client",
  classic: "classic",
  unconfirmed: "unconfirmed",
} as const;
export type Provenance = (typeof PROVENANCE)[keyof typeof PROVENANCE];
