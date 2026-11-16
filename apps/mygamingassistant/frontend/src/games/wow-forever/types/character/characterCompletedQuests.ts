/** GET /wow/characters/{slug}/quests/completed: the quests the character has completed (Blizzard updates it at logout). */
export interface CharacterCompletedQuests {
  quest_ids: number[];
}
