import type { RouteStep, TrainerNpc } from "@/games/wow-forever/data/professions/professionTypes";
import { baseStep } from "@/games/wow-forever/lib/professionsAddon/baseStep";
import { npcPlace } from "@/games/wow-forever/lib/professionsAddon/npcPlace";
import { parseSkillSpan } from "@/games/wow-forever/lib/professionsAddon/parseSkillSpan";
import type { AddonPlace } from "@/games/wow-forever/types/professionsAddon/addonPlace";
import type { AddonStep } from "@/games/wow-forever/types/professionsAddon/addonStep";
import { ADDON_STEP_KIND } from "@/games/wow-forever/types/professionsAddon/addonStep";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

type MilestoneNpc = TrainerNpc | Readonly<Record<PlayerFaction, TrainerNpc>>;

function isSingleNpc(npc: MilestoneNpc): npc is TrainerNpc {
  return "npcId" in npc;
}

function milestonePlaces(npc: MilestoneNpc): { A: AddonPlace[]; H: AddonPlace[] } {
  if (isSingleNpc(npc)) return { A: [npcPlace(npc)], H: [npcPlace(npc)] };
  return { A: [npcPlace(npc.A)], H: [npcPlace(npc.H)] };
}

/** A hand-written guide route (Cooking, Fishing and the gathering professions) as addon rows, in the site's order. */
export function buildGuideSteps(route: readonly RouteStep[]): AddonStep[] {
  return route.map((entry): AddonStep => {
    const { from, to } = parseSkillSpan(entry.skill);
    const confirmed = entry.confidence === "confirmed";
    if (entry.kind === "craft") {
      return {
        ...baseStep(ADDON_STEP_KIND.text, from, to, entry.name, confirmed),
        text: entry.materials,
        source: entry.source,
        note: entry.note ?? null,
        mats: (entry.mats ?? []).map((mat) => ({ id: mat.id, name: mat.name, count: null })),
      };
    }
    return {
      ...baseStep(ADDON_STEP_KIND.milestone, from, to, entry.name, confirmed),
      text: entry.detail,
      rank: entry.teaches?.rank ?? null,
      places: entry.npc ? milestonePlaces(entry.npc) : null,
    };
  });
}
