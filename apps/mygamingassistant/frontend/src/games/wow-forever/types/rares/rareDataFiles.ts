/** The two generated files as they sit on disk (`data/rares/`), before decoding. */
export interface RareDataFiles {
  forever: {
    clientBuild: number;
    seenOn: string;
    columns: readonly string[];
    rares: readonly (readonly (string | number)[])[];
    itemColumns: readonly string[];
    items: Readonly<Record<string, readonly (string | null)[]>>;
    zones: Readonly<Record<string, string>>;
  };
  classic: {
    spawnColumns: readonly string[];
    dropColumns: readonly string[];
    rares: Readonly<
      Record<
        string,
        {
          minLevel: number;
          maxLevel: number;
          spawns: readonly (readonly (string | number)[])[];
          drops: readonly (readonly number[])[];
        }
      >
    >;
  };
}
