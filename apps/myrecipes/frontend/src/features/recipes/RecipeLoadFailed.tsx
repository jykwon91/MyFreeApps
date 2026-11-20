import { ChefHat } from "lucide-react";
import { EmptyState } from "@platform/ui";
import { RECIPE_LOAD_FAILED_MESSAGES } from "@/constants/recipe-detail-messages";

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
        heading={RECIPE_LOAD_FAILED_MESSAGES.heading}
        body={RECIPE_LOAD_FAILED_MESSAGES.body}
        action={{ label: RECIPE_LOAD_FAILED_MESSAGES.tryAgain, onClick: onRetry, loading: isRetrying }}
      />
    </div>
  );
}
