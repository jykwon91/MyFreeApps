import type { DiscoveryResults } from "@myrecipes/api-client/types/recipe/discovery";
import type { DiscoveryRead } from "./DiscoveryRead";
import type { DiscoverySearch } from "./DiscoverySearch";

export interface DiscoveryState {
  /** Bumped when the account leaves, so work it started can't land in the next account's state. */
  generation: number;
  search: DiscoverySearch | null;
  /** The last search's answer. The detail screen finds its result here by id. */
  results: DiscoveryResults | null;
  /** By result id. A read costs a Claude call, so each is kept and never repeated once done. */
  reads: Record<string, DiscoveryRead>;
  /** The recipe each result was saved as, by result id, so one isn't saved twice. */
  saved: Record<string, string>;
}
