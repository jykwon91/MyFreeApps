/** The mob levels worth skinning now: your skill's reach, kept to mobs you can kill at your level. */
export interface SkinBand {
  /** The skill it's for (1 when none is typed: just trained). */
  skill: number;
  /** Your level; null = not set. */
  level: number | null;
  /** Lowest and highest mob level to skin. */
  min: number;
  max: number;
  /** The highest level your skill can skin. */
  skillMax: number;
  /** Your level, not your skill, sets `max`. */
  levelCapped: boolean;
}
