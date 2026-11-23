import { DISCOVERY_NO_RESULTS_COPY } from "@myrecipes/api-client/constants/discovery";
import { DISCOVERY_RESULTS_SUMMARY } from "@myrecipes/api-client/constants/discoveryResultsSummary";
import type { DiscoveryResults } from "@myrecipes/api-client/types/recipe/discovery";

interface Props {
  results: DiscoveryResults;
}

/**
 * What a finished search found, for the live region above the results. None found is said for
 * screen readers only: the empty state below already shows it.
 */
export default function DiscoveryResultCount({ results }: Props) {
  const count = results.recipes.length;
  if (count === 0) {
    return <span className="sr-only">{DISCOVERY_NO_RESULTS_COPY.heading(results.query)}</span>;
  }
  return (
    <p className="text-sm text-muted-foreground">
      {DISCOVERY_RESULTS_SUMMARY.lead(count)} <span className="text-foreground">{results.query}</span>
      {DISCOVERY_RESULTS_SUMMARY.tail}
    </p>
  );
}
