/** What a quest giver, objective or hand-in is: a creature, an object you click, or an item. */
export const QUEST_TARGET_KIND = { npc: "npc", object: "object", item: "item" } as const;
export type QuestTargetKind = (typeof QUEST_TARGET_KIND)[keyof typeof QUEST_TARGET_KIND];
