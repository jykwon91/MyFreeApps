/** One area an "Explore <Zone>" achievement counts, and where it is on its zone map (percent). */
export interface ExploreArea {
  /** The achievement criteria id, what the game's achievement API reports progress by. */
  readonly criteria: number;
  /** The WorldMapOverlay the criteria names (the achievement API's asset id). */
  readonly overlay: number;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  /** `ground`: the World Map's walk spot inside the area; `map`: the middle of its map overlay. */
  readonly spot: "ground" | "map";
  /** The patch of the zone map the area covers (left, top, right, bottom, percent): the overlay's hit rect on today's art. */
  readonly rect: readonly [number, number, number, number];
  /** Offset of the overlay today's zone art draws (matches `C_MapExplorationInfo.GetExploredMapTextures`); null when it draws none. */
  readonly texture: readonly [number, number] | null;
}
