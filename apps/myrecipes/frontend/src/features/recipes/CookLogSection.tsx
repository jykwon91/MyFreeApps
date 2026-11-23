import { StaleDataBanner } from "@platform/ui";
import type { CookLogResponse } from "@myrecipes/api-client/types/recipe/cook-log";
import { COOK_LOG_MESSAGES } from "@myrecipes/api-client/constants/cookLog";
import CookLogHistory from "@/features/recipes/CookLogHistory";
import CookLogSkeleton from "@/features/recipes/CookLogSkeleton";
import SectionLoadFailed from "@/features/recipes/SectionLoadFailed";

interface Props {
  recipeId: string;
  /** Undefined until the first load succeeds. */
  cooks: CookLogResponse[] | undefined;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  versionNumberById: Record<string, number>;
}

/**
 * The owner's cook log. "No cooks logged yet" is only said for a log that came back empty, never
 * while it loads or after it failed (that invites logging the same cook twice). A failed refresh
 * keeps the cooks on screen with a note.
 */
export default function CookLogSection({ recipeId, cooks, isError, isFetching, onRetry, versionNumberById }: Props) {
  function renderBody() {
    if (cooks === undefined) {
      if (!isError) return <CookLogSkeleton />;
      return (
        <SectionLoadFailed
          message={COOK_LOG_MESSAGES.loadFailed}
          retryLabel={COOK_LOG_MESSAGES.tryAgain}
          isRetrying={isFetching}
          onRetry={onRetry}
        />
      );
    }
    return (
      <>
        {isError ? <StaleDataBanner message={COOK_LOG_MESSAGES.updateFailed} /> : null}
        <CookLogHistory recipeId={recipeId} cooks={cooks} versionNumberById={versionNumberById} />
      </>
    );
  }

  return (
    <section className="bg-card border rounded-lg p-6 space-y-4">
      <h2 className="text-base font-medium">{COOK_LOG_MESSAGES.historyTitle}</h2>
      {renderBody()}
    </section>
  );
}
