import type { GuildMatchType } from "@/games/wow-forever/types/guild/guildMatch";

/** URL params used by the guild help tab. */
export const HELP_TYPE_PARAM = "help_type";
export const HELP_FOR_PARAM = "help_for";

/** All filter values for the match-type chip. */
export const HELP_TYPES: readonly (GuildMatchType | "all")[] = ["all", "enchant", "gear"];
export const HELP_TYPE_LABELS: Readonly<Record<GuildMatchType | "all", string>> = {
  all: "All",
  enchant: "Enchants",
  gear: "Gear upgrades",
};

/** The active type filter from the URL, defaulting to "all". */
export function helpTypeParam(params: URLSearchParams): GuildMatchType | "all" {
  const raw = params.get(HELP_TYPE_PARAM);
  if (raw === "enchant" || raw === "gear") return raw;
  return "all";
}

/** The active member-picker filter from the URL (a slug), or null for everyone. */
export function helpForParam(params: URLSearchParams): string | null {
  return params.get(HELP_FOR_PARAM) ?? null;
}

/** Build a URLSearchParams string for the help tab filters. */
export function buildHelpParams(
  base: URLSearchParams,
  type: GuildMatchType | "all",
  forSlug: string | null,
): URLSearchParams {
  const next = new URLSearchParams(base);
  if (type === "all") {
    next.delete(HELP_TYPE_PARAM);
  } else {
    next.set(HELP_TYPE_PARAM, type);
  }
  if (forSlug === null) {
    next.delete(HELP_FOR_PARAM);
  } else {
    next.set(HELP_FOR_PARAM, forSlug);
  }
  return next;
}
