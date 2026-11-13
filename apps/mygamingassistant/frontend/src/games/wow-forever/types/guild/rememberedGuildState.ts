import type { RememberedGuild } from "@/games/wow-forever/types/guild/rememberedGuild";

/** The remembered guild, and ways to change it. */
export interface RememberedGuildState {
  guild: RememberedGuild | null;
  remember: (guild: RememberedGuild) => void;
  forget: () => void;
}
