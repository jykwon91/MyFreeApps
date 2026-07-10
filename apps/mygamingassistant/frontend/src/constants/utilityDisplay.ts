/**
 * utilityDisplay — single source of truth for utility type display metadata.
 *
 * Keyed by slug (the backend fixture slug), not by display name.
 * CS2 slugs: smoke, flash, molotov, grenade
 * Valorant slugs: smoke, flash, molotov, recon, shock (subset; unknown slugs use fallback)
 *
 * sortOrder defines the LOCKED within-zone ordering:
 *   Smoke → Flash → Molotov → HE
 * Unknown/unrecognized slugs sort last (sortOrder 99).
 */

export interface UtilDisplay {
  label: string;      // short display label
  chipLabel: string;  // filter-chip label (compact)
  badgeBg: string;    // Tailwind bg class
  badgeText: string;  // Tailwind text class
  sortOrder: number;
}

export const UTIL_DISPLAY: Record<string, UtilDisplay> = {
  smoke:   { label: "Smoke",   chipLabel: "Smoke",   badgeBg: "bg-blue-600",   badgeText: "text-white",     sortOrder: 0 },
  flash:   { label: "Flash",   chipLabel: "Flash",   badgeBg: "bg-yellow-400", badgeText: "text-slate-900", sortOrder: 1 },
  molotov: { label: "Molotov", chipLabel: "Molotov", badgeBg: "bg-orange-700", badgeText: "text-white",     sortOrder: 2 },
  grenade: { label: "HE",      chipLabel: "HE",      badgeBg: "bg-red-600",    badgeText: "text-white",     sortOrder: 3 },
  // Valorant-only slugs that share names with CS2 entries above (smoke/flash/molotov)
  // are handled by the entries already keyed above.
  recon:   { label: "Recon",   chipLabel: "Recon",   badgeBg: "bg-teal-600",   badgeText: "text-white",     sortOrder: 5 },
  shock:   { label: "Shock",   chipLabel: "Shock",   badgeBg: "bg-purple-600", badgeText: "text-white",     sortOrder: 6 },
};

/** Safe accessor — returns a sensible fallback for any unknown slug. Never throws. */
export function utilDisplay(slug: string | undefined | null): UtilDisplay {
  return (slug != null && UTIL_DISPLAY[slug]) || {
    label: "Util",
    chipLabel: "Util",
    badgeBg: "bg-muted",
    badgeText: "text-foreground",
    sortOrder: 99,
  };
}
