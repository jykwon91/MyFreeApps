import type { RememberedGuild } from "@/games/wow-forever/types/guild/rememberedGuild";

/** A stored remembered guild, or null when it's missing or from an older shape. */
export function parseRememberedGuild(raw: unknown): RememberedGuild | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { slug, name, faction } = raw as Record<string, unknown>;
  if (typeof slug !== "string" || typeof name !== "string" || typeof faction !== "string") return null;
  if (!slug || !name) return null;
  return { slug, name, faction };
}
