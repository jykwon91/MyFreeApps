/**
 * "Where to level": how a zone's level range [min, max] reads for a player of
 * level L. Right = min − 2 ≤ L ≤ max (yellow-to-orange mobs, full XP); below
 * that the zone out-levels you, above it the mobs turn green then grey.
 */
import { ZONE_FIT, type ZoneFit } from "@/games/wow-forever/types/mapLayers/zoneFit";
import type { ProvenanceTag } from "@/games/wow-forever/types/provenance/provenanceTag";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

/** A zone still suits you this many levels below its lowest. */
export const FIT_LEVELS_BELOW_MIN = 2;

export const ZONE_FIT_ORDER: readonly ZoneFit[] = [ZONE_FIT.right, ZONE_FIT.tooLow, ZONE_FIT.tooHigh];

export const ZONE_FIT_LABEL: Readonly<Record<ZoneFit, string>> = {
  [ZONE_FIT.right]: "Right for you",
  [ZONE_FIT.tooLow]: "Too low",
  [ZONE_FIT.tooHigh]: "Too high",
};

export const ZONE_FIT_HINT: Readonly<Record<ZoneFit, string>> = {
  [ZONE_FIT.right]: "Mobs around your level — full XP.",
  [ZONE_FIT.tooLow]: "Mobs below you go green, then grey — little XP.",
  [ZONE_FIT.tooHigh]: "Mobs out-level you — orange and red.",
};

/** A symbol next to the zone label, so the fit never relies on colour alone. */
export const ZONE_FIT_SYMBOL: Readonly<Record<ZoneFit, string>> = {
  [ZONE_FIT.right]: "✓",
  [ZONE_FIT.tooLow]: "↓",
  [ZONE_FIT.tooHigh]: "↑",
};

/** Tint over the zone's highlight art on a continent map. */
export const ZONE_FIT_TINT: Readonly<Record<ZoneFit, string>> = {
  [ZONE_FIT.right]: "bg-emerald-400",
  [ZONE_FIT.tooLow]: "bg-slate-400",
  [ZONE_FIT.tooHigh]: "bg-red-500",
};

/** The level line of a zone label, on the dark halo over the map art. */
export const ZONE_FIT_TEXT: Readonly<Record<ZoneFit, string>> = {
  [ZONE_FIT.right]: "text-emerald-300",
  [ZONE_FIT.tooLow]: "text-slate-300",
  [ZONE_FIT.tooHigh]: "text-red-300",
};

/** The legend's swatch (solid, so it reads at a glance). */
export const ZONE_FIT_SWATCH: Readonly<Record<ZoneFit, string>> = {
  [ZONE_FIT.right]: "bg-emerald-500",
  [ZONE_FIT.tooLow]: "bg-slate-400",
  [ZONE_FIT.tooHigh]: "bg-red-500",
};

/** Zone level ranges are worked out from the Forever client's AreaTable — game files, not seen in play. */
export const ZONE_LEVELS_PROVENANCE: ProvenanceTag = {
  provenance: PROVENANCE.client,
  detail:
    "Worked out from the level the game files give each part of a zone for exploring (odd outliers dropped). Not yet checked against the mobs in game.",
};
