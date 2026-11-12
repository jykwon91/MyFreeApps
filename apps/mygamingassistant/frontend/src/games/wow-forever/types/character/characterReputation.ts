/** One faction's standing with the character, as the game's reputation pane shows it. */
export interface CharacterReputation {
  /** Blizzard's faction id. */
  id: number;
  name: string;
  /** "Hated" … "Exalted". */
  standing: string;
  /** 0 = Hated … 7 = Exalted. */
  tier: number;
  /** Progress within the standing, out of `max` (0 / 0 at Exalted's cap). */
  value: number;
  max: number;
}
