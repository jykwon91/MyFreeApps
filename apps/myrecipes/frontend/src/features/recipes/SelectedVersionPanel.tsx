import { ChefHat } from "lucide-react";
import { EmptyState } from "@platform/ui";
import type { VersionResponse } from "@myrecipes/api-client/types/recipe/version";
import { VERSION_LOAD_FAILED_MESSAGES } from "@/constants/recipe-detail-messages";
import RecipeDetailSkeleton from "@/features/recipes/RecipeDetailSkeleton";
import VersionBody from "@/features/recipes/VersionBody";

interface Props {
  version: VersionResponse | undefined;
  latestVersionId: string | null;
  isError: boolean;
  isRetrying: boolean;
  onRetry: () => void;
}

/** The recipe detail's left column: the selected version, its load failure with a retry, or a skeleton. */
export default function SelectedVersionPanel({ version, latestVersionId, isError, isRetrying, onRetry }: Props) {
  if (version) {
    return (
      <>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Viewing v{version.version_number}</span>
          {version.id === latestVersionId ? <span className="text-primary">(latest)</span> : null}
          {version.change_note ? <span className="truncate">— {version.change_note}</span> : null}
        </div>
        <VersionBody version={version} />
      </>
    );
  }
  if (isError) {
    return (
      <EmptyState
        icon={<ChefHat className="w-12 h-12 text-destructive" />}
        heading={VERSION_LOAD_FAILED_MESSAGES.heading}
        body={VERSION_LOAD_FAILED_MESSAGES.body}
        action={{ label: VERSION_LOAD_FAILED_MESSAGES.tryAgain, onClick: onRetry, loading: isRetrying }}
      />
    );
  }
  return <RecipeDetailSkeleton />;
}
