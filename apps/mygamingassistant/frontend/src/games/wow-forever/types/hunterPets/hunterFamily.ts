/** One tamable beast family: its modifiers (percent), diet and the abilities it can learn. */
export interface HunterFamily {
  id: number;
  slug: string;
  name: string;
  /** Icon file data id. */
  icon: number;
  diet: readonly string[];
  /** Pet damage, armor and health modifiers in percent (negative = lower than the base). */
  damage: number;
  armor: number;
  health: number;
  /** A family Classic doesn't have (Fox). */
  isNew: boolean;
}
