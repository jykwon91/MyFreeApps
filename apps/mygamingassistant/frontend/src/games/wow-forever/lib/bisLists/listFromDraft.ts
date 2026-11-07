import { MAX_LEVEL } from "@/games/wow-forever/data/levelCap";
import { BIS_LIST_START } from "@/games/wow-forever/data/bisLists/bisListStartOptions";
import { cleanBisListName } from "@/games/wow-forever/lib/bisLists/bisListName";
import { suggestedBisListName } from "@/games/wow-forever/lib/bisLists/bisListText";
import { recommendedBisItems } from "@/games/wow-forever/lib/bisLists/recommendedBisItems";
import type { BisListDraft } from "@/games/wow-forever/types/bisLists/bisListDraft";
import type { SharedBisList } from "@/games/wow-forever/types/bisLists/sharedBisList";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { GearData } from "@/games/wow-forever/types/gearData";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

/** The new list a filled-in form makes: empty, or the recommended picks for it (quest rewards from `faction`'s side). */
export function listFromDraft(draft: BisListDraft, faction: PlayerFaction, items: readonly ClientItem[], gear: GearData): SharedBisList {
  const { classId, specId, phase } = draft;
  const name = cleanBisListName(draft.name, suggestedBisListName(draft));
  if (draft.start === BIS_LIST_START.blank) return { name, classId, specId, phase, items: {} };
  const level = Math.min(Math.max(1, Math.round(draft.level ?? MAX_LEVEL)), MAX_LEVEL);
  return {
    name,
    classId,
    specId,
    phase,
    items: recommendedBisItems(items, gear, { classId, specId, phase, level, faction }),
  };
}
