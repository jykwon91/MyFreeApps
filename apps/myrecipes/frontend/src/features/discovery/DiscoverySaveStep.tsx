import EditorHeader from "@/features/recipes/EditorHeader";
import RecipeEditorForm from "@/features/recipes/RecipeEditorForm";
import { discoveredRecipeDraft } from "@myrecipes/api-client/utils/discoveredRecipeDraft";
import type { DiscoveredDetail } from "@myrecipes/api-client/types/recipe/discovery";

interface Props {
  detail: DiscoveredDetail;
  onCreated: (recipeId: string) => void;
  onCancel: () => void;
}

/**
 * Saving a read result: the editor is seeded with the read draft, with the original page recorded
 * as the source so the provenance survives the save.
 */
export default function DiscoverySaveStep({ detail, onCreated, onCancel }: Props) {
  return (
    <>
      <EditorHeader
        backTo="/discover"
        backLabel="Discover"
        title="Save this recipe"
        subtitle="We've filled in what the page said — check anything that looks off, then save it to your recipes."
      />
      <RecipeEditorForm
        mode="create"
        seed={{ draft: discoveredRecipeDraft(detail), origin: "discover" }}
        onCancel={onCancel}
        onCreated={onCreated}
      />
    </>
  );
}
