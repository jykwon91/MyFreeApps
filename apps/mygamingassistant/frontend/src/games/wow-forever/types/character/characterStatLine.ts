/** One row of the stats panel. `bonus` is what gear, talents and buffs add ("+18"). */
export interface CharacterStatLine {
  label: string;
  value: string;
  bonus: string | null;
}
