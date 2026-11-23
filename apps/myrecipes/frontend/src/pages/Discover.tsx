import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useWarnBeforeUnload } from "@platform/ui";
import DiscoveryBrowse from "@/features/discovery/DiscoveryBrowse";
import DiscoveryDetailStep from "@/features/discovery/DiscoveryDetailStep";
import DiscoverySaveStep from "@/features/discovery/DiscoverySaveStep";
import { useFocusHeadingOnChange } from "@/hooks/useFocusHeadingOnChange";
import type { AppDispatch, RootState } from "@/lib/store";
import { discoverViewKey } from "@/utils/discoverViewKey";
import {
  recipeSaved,
  selectDiscoveryGeneration,
  selectDiscoveryIsBusy,
  selectDiscoveryRead,
  selectDiscoveryResults,
  selectDiscoverySearch,
  selectSavedRecipeId,
} from "@myrecipes/api-client/store/discoverySlice";
import { readDiscoveredRecipe } from "@myrecipes/api-client/store/readDiscoveredRecipe";
import type { DiscoveredRecipe } from "@myrecipes/api-client/types/recipe/discovery";

/**
 * Discover recipes from the web (/discover).
 *
 * Two paid, slow calls, so the flow is built around not spending either one by
 * accident:
 *
 *   browse  — a query box; searching is an explicit submit, never a remount or
 *             a cache miss (both endpoints are mutations for this reason).
 *   detail  — clicking a card reads that one page in full. A failed read stays
 *             open with Try again, View original and Back; a read in flight
 *             can be left, and carries on.
 *   save    — the draft drops into the ordinary recipe editor for review, the
 *             same way photo import does, and saves through POST /recipes.
 *             The result then opens that recipe instead of saving it again.
 *
 * The search, its results, every read and what was saved live in the shared
 * discovery slice (as on the phone), so leaving Discover and coming back keeps
 * them without paying again; they go when the account leaves or the page is
 * reloaded. Which step is showing is not reconstructible from a URL, so it
 * stays in component state, and focus follows it to each step's heading.
 */
export default function Discover() {
  const dispatch = useDispatch<AppDispatch>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const results = useSelector(selectDiscoveryResults);
  const search = useSelector(selectDiscoverySearch);
  const generation = useSelector(selectDiscoveryGeneration);
  const isBusy = useSelector(selectDiscoveryIsBusy);
  const read = useSelector((state: RootState) => (selectedId ? selectDiscoveryRead(state, selectedId) : undefined));
  const savedRecipeId = useSelector((state: RootState) =>
    selectedId ? selectSavedRecipeId(state, selectedId) : undefined,
  );
  // Gone when the results it came from are: another account, or a new search.
  const selected = results?.recipes.find((recipe) => recipe.id === selectedId);
  const step = selected ? selected.id : null;

  const headingRef = useFocusHeadingOnChange<HTMLHeadingElement>(
    discoverViewKey(step, isSaving, read?.status, search?.status),
  );

  // Warn before a browser close or refresh throws away an in-flight call —
  // the request keeps running server-side and the answer would be lost.
  useWarnBeforeUnload(isBusy);

  function openResult(recipe: DiscoveredRecipe) {
    setSelectedId(recipe.id);
    setIsSaving(false);
    // One already running or read isn't sent again.
    void dispatch(readDiscoveredRecipe(recipe));
  }

  function backToResults() {
    setSelectedId(null);
    setIsSaving(false);
  }

  if (!selected) {
    return (
      <div className="p-4 sm:p-8">
        <DiscoveryBrowse headingRef={headingRef} onOpen={openResult} />
      </div>
    );
  }

  if (isSaving && read?.status === "read") {
    return (
      <div className="space-y-6 p-4 sm:p-8">
        <DiscoverySaveStep
          detail={read.detail}
          onCreated={(recipeId) => dispatch(recipeSaved({ resultId: selected.id, recipeId, generation }))}
          onCancel={() => setIsSaving(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-8">
      <DiscoveryDetailStep
        recipe={selected}
        read={read}
        savedRecipeId={savedRecipeId}
        headingRef={headingRef}
        onBack={backToResults}
        onRetry={() => void dispatch(readDiscoveredRecipe(selected))}
        onSave={() => setIsSaving(true)}
      />
    </div>
  );
}
