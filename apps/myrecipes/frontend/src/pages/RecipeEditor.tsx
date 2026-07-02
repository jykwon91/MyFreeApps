import { useNavigate, useParams } from "react-router-dom";
import EditorHeader from "@/features/recipes/EditorHeader";
import RecipeEditorForm from "@/features/recipes/RecipeEditorForm";
import TweakEditor from "@/pages/TweakEditor";

/**
 * Recipe editor route. Two modes, distinguished by the presence of a recipe id
 * in the path:
 *   - /recipes/new      -> create a brand-new recipe (its first version)
 *   - /recipes/:id/tweak -> create a new version of an existing recipe,
 *     prefilled from its latest version (see TweakEditor)
 */
export default function RecipeEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isTweak = Boolean(id);

  if (!isTweak) {
    return (
      <main className="p-4 sm:p-8 space-y-6">
        <EditorHeader backTo="/" backLabel="Recipes" title="New recipe" />
        <RecipeEditorForm mode="create" />
      </main>
    );
  }

  return <TweakEditor recipeId={id as string} onMissing={() => navigate("/")} />;
}
