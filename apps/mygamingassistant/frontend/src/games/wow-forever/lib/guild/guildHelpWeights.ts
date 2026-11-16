import { LEVELING_SPEC_ID } from "@/games/wow-forever/data/classes";
import type { StatWeights } from "@/games/wow-forever/data/weights/statWeights";
import { characterClassId } from "@/games/wow-forever/lib/character/characterClassId";
import { resolveHelpSpecId } from "@/games/wow-forever/lib/guild/guildHelpSpec";
import { resolveWeights } from "@/games/wow-forever/scoring/resolveWeights";
import type { GuildHelpMember } from "@/games/wow-forever/types/guild/guildHelpMember";

/**
 * The stat weights Help each other scores a member's gear with: their spec's Level 60 weights when their
 * talents name one, else their class's leveling weights. Null for an unknown class.
 */
export function guildHelpWeights(member: GuildHelpMember): StatWeights | null {
  const classId = member.class_name ? characterClassId(member.class_name) : undefined;
  if (!classId) return null;
  const specId = resolveHelpSpecId(member.talents);
  return resolveWeights({
    classId,
    specId: specId ?? LEVELING_SPEC_ID,
    bracket: specId !== null ? "level60" : "leveling",
    currentHitPct: null,
  }).weights;
}
