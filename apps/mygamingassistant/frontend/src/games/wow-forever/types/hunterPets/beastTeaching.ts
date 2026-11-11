/** An ability rank a beast teaches a hunter's pet. */
export interface BeastTeaching {
  spell: number;
  abilitySlug: string;
  abilityName: string;
  /** The ability's icon file data id. */
  icon: number;
  rank: number;
}
