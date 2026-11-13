export interface LineupBoardEmptyProps {
  mapName: string;
  /** Applied side value ("any" / "side_a" / "side_b"). */
  side: string;
  /** Applied utility type slugs ([] = all). */
  filteredUtils: string[];
}
