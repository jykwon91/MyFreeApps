import { Compass } from "lucide-react";
import { EmptyState } from "@platform/ui";
import {
  DISCOVERY_EMPTY_COPY,
  DISCOVERY_NO_RESULTS_COPY,
  DISCOVERY_SEARCH_STAGES,
} from "@myrecipes/api-client/constants/discovery";
import type { DiscoveredRecipe, DiscoveryResults } from "@myrecipes/api-client/types/recipe/discovery";
import DiscoveryCard from "@/features/discovery/DiscoveryCard";
import DiscoveryResultsSkeleton from "@/features/discovery/DiscoveryResultsSkeleton";
import DiscoveryStatus from "@/features/discovery/DiscoveryStatus";

interface Props {
  isSearching: boolean;
  /** The last search's answer, if one came back. */
  results: DiscoveryResults | null;
  onOpen: (recipe: DiscoveredRecipe) => void;
}

/** Below the search box: the wait, the result cards, nothing found, or what Discover does. */
export default function DiscoveryBrowseContent({ isSearching, results, onOpen }: Props) {
  if (isSearching) {
    return (
      <div className="space-y-4">
        <DiscoveryStatus stages={DISCOVERY_SEARCH_STAGES} />
        <DiscoveryResultsSkeleton />
      </div>
    );
  }
  if (!results) {
    return (
      <EmptyState
        icon={<Compass className="h-12 w-12" />}
        heading={DISCOVERY_EMPTY_COPY.heading}
        body={DISCOVERY_EMPTY_COPY.body}
      />
    );
  }
  if (results.recipes.length === 0) {
    return (
      <EmptyState
        icon={<Compass className="h-12 w-12" />}
        heading={DISCOVERY_NO_RESULTS_COPY.heading(results.query)}
        body={DISCOVERY_NO_RESULTS_COPY.body}
      />
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {results.recipes.map((recipe) => (
        <DiscoveryCard key={recipe.id} recipe={recipe} onOpen={onOpen} />
      ))}
    </div>
  );
}
