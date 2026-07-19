/**
 * sideDisplay — single source of truth for T/CT (side_a/side_b) chip display
 * metadata.
 *
 * Before this module, two independent color pairs existed for the exact same
 * concept: GlanceBoardTile's SIDE_CHIP (gold `bg-yellow-500/20` for side_a /
 * blue `bg-blue-500/20` for side_b) and LineupListRow's inline classes
 * (orange `bg-orange-500/15` for side_a / sky `bg-sky-500/15` for side_b).
 * Same information, two different looks depending on which surface the
 * operator was on. This module unifies both call sites on the gold/blue
 * pair (GlanceBoardTile's tokens) — mirrors the `constants/utilityDisplay.ts`
 * pattern: keyed by the domain value, a safe accessor that never throws.
 *
 * Label resolution: callers that have a `Game` (side_a_label/side_b_label —
 * e.g. Valorant's "Atk"/"Def") pass it through `labels` to get the
 * game-accurate label. Callers without a `Game` in scope (GlanceBoardTile
 * has no `game` prop) get the CS2-style "T"/"CT" fallback.
 */

export interface SideDisplay {
  bg: string;
  text: string;
  label: string;
}

interface SideTokens {
  bg: string;
  text: string;
}

const SIDE_TOKENS: Record<"side_a" | "side_b" | "any", SideTokens> = {
  side_a: { bg: "bg-yellow-500/20 border border-yellow-500/50", text: "text-yellow-600 dark:text-yellow-400" },
  side_b: { bg: "bg-blue-500/20 border border-blue-500/50",     text: "text-blue-600 dark:text-blue-400" },
  any:    { bg: "bg-muted border border-border",                text: "text-muted-foreground" },
};

export interface SideDisplayLabels {
  side_a_label?: string | null;
  side_b_label?: string | null;
}

/**
 * Safe accessor — returns the unified side chip tokens + a label for any
 * side value. Never throws; unknown/null sides degrade to the "any" tokens.
 *
 * `labels` is optional — pass a `Game` (or any object shaped like one) to
 * get the game's actual side labels (e.g. Valorant "Atk"/"Def"); omit it
 * for the CS2-default "T"/"CT"/"Both".
 */
export function sideDisplay(
  side: string | null | undefined,
  labels?: SideDisplayLabels,
): SideDisplay {
  const key: "side_a" | "side_b" | "any" =
    side === "side_a" || side === "side_b" ? side : "any";
  const tokens = SIDE_TOKENS[key];
  const label =
    key === "side_a" ? (labels?.side_a_label ?? "T") :
    key === "side_b" ? (labels?.side_b_label ?? "CT") :
    "Both";
  return { ...tokens, label };
}
