/** A hand's (or the ranged slot's) damage range; speed and DPS are Blizzard's when it sends them. */
export interface CharacterWeaponDamage {
  min: number;
  max: number;
  speed: number | null;
  dps: number | null;
}
