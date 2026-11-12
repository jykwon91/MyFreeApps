/** One stat line of an equipped item, as the game's tooltip prints it. */
export interface CharacterItemStat {
  text: string;
  /** A green "Equip:" line rather than a white base stat. */
  equip_bonus: boolean;
}
