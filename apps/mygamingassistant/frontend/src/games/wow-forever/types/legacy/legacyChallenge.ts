/** One challenge that earns Legacy points, its variants in the game files merged into one row. */
export interface LegacyChallenge {
  /** The lowest achievement id — the checklist key. Stored — never change. */
  id: string;
  title: string;
  text: string;
  points: number;
  icon: number;
  achievements: readonly number[];
}
