import { ChefHat } from "lucide-react";
import { EmptyState } from "@platform/ui";
import { RECIPE_LOAD_FAILED_COPY } from "@myrecipes/api-client/constants/recipeLoadFailedCopy";
import { STALE_DATA_MESSAGES } from "@/constants/stale-data-messages";

interface RecipeLoadFailedProps {
  onRetry: () => void;
  isRetrying: boolean;
}

/** The recipe is there but couldn't be fetched: say so and offer another try, rather than calling it deleted. */
export default function RecipeLoadFailed({ onRetry, isRetrying }: RecipeLoadFailedProps) {
  return (
    <div className="p-4 sm:p-8 space-y-6">
      <EmptyState
        icon={<ChefHat className="w-12 h-12 text-destructive" />}
        heading={RECIPE_LOAD_FAILED_COPY.heading}
        body={RECIPE_LOAD_FAILED_COPY.body}
        action={{ label: STALE_DATA_MESSAGES.tryAgain, onClick: onRetry, loading: isRetrying }}
      />
    </div>
  );
}
