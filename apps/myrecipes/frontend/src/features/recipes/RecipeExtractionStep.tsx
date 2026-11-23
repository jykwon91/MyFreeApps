import { UnsavedChangesDialog, useUnsavedChangesGuard } from "@platform/ui";
import { PHOTO_IMPORT_STOP_COPY } from "@myrecipes/api-client/constants/photoImport";
import RecipeExtractionProgress from "@/features/recipes/RecipeExtractionProgress";

/**
 * The photo being read. While it's on screen, leaving (a link, Back, closing the tab) asks first.
 * It's its own component because a router takes one blocker at a time: the guard must be gone by
 * the time the review form, which has its own, is shown. Cancelling the request when the page is
 * left is the page's job, which owns the request.
 */
export default function RecipeExtractionStep() {
  const guard = useUnsavedChangesGuard(true);
  return (
    <>
      <RecipeExtractionProgress />
      <UnsavedChangesDialog
        open={guard.isAsking}
        copy={PHOTO_IMPORT_STOP_COPY}
        onKeepEditing={guard.keepEditing}
        onDiscard={guard.discard}
      />
    </>
  );
}
