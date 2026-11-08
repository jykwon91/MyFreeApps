/** The two generated files as they sit on disk (`data/hunterPets/`), before decoding. */
export interface HunterPetsDataFiles {
  forever: {
    seenOn: string;
    families: readonly {
      id: number;
      slug: string;
      name: string;
      icon: number;
      diet: readonly string[];
      damage: number;
      armor: number;
      health: number;
      new: boolean;
    }[];
    abilities: readonly {
      slug: string;
      name: string;
      icon: number;
      new: boolean;
      families: readonly number[];
      /** [spell, level, text, new (0 | 1), the families that learn this rank when they differ from the ability's | null] */
      ranks: readonly (readonly [number, number, string | null, number, readonly number[] | null])[];
    }[];
    /** [id, name, family] */
    seen: readonly (readonly [number, string, number])[];
  };
  classic: {
    zones: Readonly<Record<string, string>>;
    /** [id, name, family, minLevel, maxLevel, attackMs, zone keys, ability rank spells] */
    beasts: readonly (readonly [number, string, number, number, number, number, readonly string[], readonly number[]])[];
  };
}
