import type { GuildHelpFilters } from "@/games/wow-forever/types/guild/guildHelpFilters";
import type { GuildMatchType } from "@/games/wow-forever/types/guild/guildMatch";

/** URL params used by the guild help tab. */
export const HELP_TYPE_PARAM = "help_type";
export const HELP_FOR_PARAM = "help_for";
export const HELP_BY_PARAM = "help_by";

/** All filter values for the match-type chip. */
export const HELP_TYPES: readonly (GuildMatchType | "all")[] = ["all", "enchant", "gear"];
export const HELP_TYPE_LABELS: Readonly<Record<GuildMatchType | "all", string>> = {
  all: "All",
  enchant: "Enchants",
  gear: "Gear upgrades",
};

function typeParam(params: URLSearchParams): GuildMatchType | "all" {
  const raw = params.get(HELP_TYPE_PARAM);
  if (raw === "enchant" || raw === "gear") return raw;
  return "all";
}

/** The tab's filters from the URL: every type, everyone, made by anyone when a param is missing. */
export function helpFiltersFromParams(params: URLSearchParams): GuildHelpFilters {
  return {
    type: typeParam(params),
    forSlug: params.get(HELP_FOR_PARAM) || null,
    bySlug: params.get(HELP_BY_PARAM) || null,
  };
}

function setOrDelete(params: URLSearchParams, key: string, value: string | null): void {
  if (value === null) params.delete(key);
  else params.set(key, value);
}

/** `base` with the help tab's filters written in; defaults leave their param out. */
export function buildHelpParams(base: URLSearchParams, filters: GuildHelpFilters): URLSearchParams {
  const next = new URLSearchParams(base);
  setOrDelete(next, HELP_TYPE_PARAM, filters.type === "all" ? null : filters.type);
  setOrDelete(next, HELP_FOR_PARAM, filters.forSlug);
  setOrDelete(next, HELP_BY_PARAM, filters.bySlug);
  return next;
}
