/** Your saved character's skill and known recipes in one crafting profession. */
export interface MyProfession {
  /** "Jason Kwon" */
  characterName: string;
  skill: number;
  maxSkill: number;
  /** Recipe spells (the crafting files' ids) the character already knows. */
  knownSpells: ReadonlySet<number>;
}
