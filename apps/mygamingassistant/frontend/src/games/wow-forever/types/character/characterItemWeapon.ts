/** An equipped weapon's damage lines, as the game's tooltip prints them. */
export interface CharacterItemWeapon {
  damage: string;
  speed: string | null;
  dps: string | null;
}
