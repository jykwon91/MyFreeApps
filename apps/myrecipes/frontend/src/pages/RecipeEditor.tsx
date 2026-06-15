import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, ChefHat } from "lucide-react";
import { EmptyState, Skeleton } from "@platform/ui";
import { useGetRecipeQuery } from "@/store/recipesApi";
import RecipeEditorForm from "@/features/recipes/RecipeEditorForm";

/**
 * Recipe editor route. Two modes, distinguished by the presence of a recipe id
 * in the path:
 *   - /recipes/new      -> create a brand-new recipe (its first version)
 *   - /recipes/:id/tweak -> create a new version of an existing recipe,
 *     prefilled from its latest version (lineage keys carried for the diff)
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

interface TweakEditorProps {
  recipeId: string;
  onMissing: () => void;
}

function TweakEditor({ recipeId, onMissing }: TweakEditorProps) {
  const { data, isLoading, isError } = useGetRecipeQuery(recipeId);

  if (isLoading) {
    return (
      <main className="p-4 sm:p-8 space-y-6">
        <EditorHeader
          backTo={`/recipes/${recipeId}`}
          backLabel="Back to recipe"
          title="Tweak recipe"
        />
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </main>
    );
  }

  if (isError || !data || !data.latest_version) {
    return (
      <main className="p-4 sm:p-8 space-y-6">
        <EmptyState
          icon={<ChefHat className="w-12 h-12 text-destructive" />}
          heading="Recipe not found"
          body="This recipe doesn't exist or has no version to tweak."
          action={{ label: "Back to recipes", onClick: onMissing }}
        />
      </main>
    );
  }

  return (
    <main className="p-4 sm:p-8 space-y-6">
      <EditorHeader
        backTo={`/recipes/${recipeId}`}
        backLabel="Back to recipe"
        title={`Tweak "${data.title}"`}
        subtitle={`Starting from v${data.latest_version.version_number}. Saving creates a new version and the diff shows exactly what changed.`}
      />
      <RecipeEditorForm
        mode="tweak"
        recipeId={recipeId}
        baseVersion={data.latest_version}
      />
    </main>
  );
}

interface EditorHeaderProps {
  backTo: string;
  backLabel: string;
  title: string;
  subtitle?: string;
}

function EditorHeader({ backTo, backLabel, title, subtitle }: EditorHeaderProps) {
  return (
    <div className="space-y-2">
      <Link
        to={backTo}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        {backLabel}
      </Link>
      <h1 className="text-2xl font-semibold">{title}</h1>
      {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}
