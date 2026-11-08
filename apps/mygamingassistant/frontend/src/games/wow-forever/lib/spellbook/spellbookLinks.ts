import {
  CHANGES_PATH,
  CHANGE_CATEGORY_PARAM,
  CHANGE_CLASS_PARAM,
  CHANGE_QUERY_PARAM,
} from "@/games/wow-forever/data/changes/changeFeedConfig";
import type { WowClassId } from "@/games/wow-forever/data/classes";
import { DOWNRANK_PATH, DOWNRANK_SPELL_PARAM } from "@/games/wow-forever/data/downrank/downrankConfig";
import { SPELL_ANCHOR_PREFIX } from "@/games/wow-forever/data/spellbook/spellbookConfig";
import { TALENTS_PATH, TALENT_PICK_PARAM } from "@/games/wow-forever/data/talents/talentConfig";
import type { ChangeCategory } from "@/games/wow-forever/types/changes/changeCategory";

const SPELLS_CATEGORY: ChangeCategory = "spells";

/** A spell card's element id (and `#hash`). */
export function spellAnchorId(spellId: number): string {
  return `${SPELL_ANCHOR_PREFIX}${spellId}`;
}

/** The talent calculator, opened on the talent that grants the spell. */
export function talentHref(classId: WowClassId, talentId: number): string {
  return `${TALENTS_PATH}/${classId}?${new URLSearchParams({ [TALENT_PICK_PARAM]: String(talentId) })}`;
}

/** The downrank calculator, opened on the spell's family. */
export function downrankHref(familyId: string): string {
  return `${DOWNRANK_PATH}?${new URLSearchParams({ [DOWNRANK_SPELL_PARAM]: familyId })}`;
}

/** The Changes vs Classic feed's Class spells, searched for this spell. */
export function changesHref(classId: WowClassId, spellName: string): string {
  const params = new URLSearchParams({
    [CHANGE_CATEGORY_PARAM]: SPELLS_CATEGORY,
    [CHANGE_CLASS_PARAM]: classId,
    [CHANGE_QUERY_PARAM]: spellName,
  });
  return `${CHANGES_PATH}?${params}`;
}
