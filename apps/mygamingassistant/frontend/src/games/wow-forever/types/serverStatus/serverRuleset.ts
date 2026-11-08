/** One ruleset (Normal, PvP, …) in Blizzard's live status for a region. */
export interface ServerRuleset {
  name: string;
  slug: string;
  online: boolean;
}
