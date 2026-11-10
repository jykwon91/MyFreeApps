import type { SearchDestination } from "./SearchDestination";

export interface MoreSearchResultsProps {
  query: string;
  results: readonly SearchDestination[];
  /** Called when a result is on this screen already, like the account section. */
  onShowAccount: () => void;
}
