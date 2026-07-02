import { useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, ChefHat, GitBranch, Pencil, Trash2, UtensilsCrossed } from "lucide-react";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  LoadingButton,
  showError,
  showSuccess,
} from "@platform/ui";
import {
  useGetRecipeQuery,
  useListVersionsQuery,
  useGetVersionQuery,
  useListRecipeCooksQuery,
  useDeleteRecipeMutation,
} from "@/store/recipesApi";
import RecipeDetailSkeleton from "@/features/recipes/RecipeDetailSkeleton";
import VersionTimeline from "@/features/recipes/VersionTimeline";
import VersionBody from "@/features/recipes/VersionBody";
import CookLogHistory from "@/features/recipes/CookLogHistory";
import CookLogModal from "@/features/recipes/CookLogModal";
import EditRecipeMetaModal from "@/features/recipes/EditRecipeMetaModal";

export default function RecipeDetail() {
  const { id } = useParams<{ id: string }>();
  const recipeId = id ?? "";
  const navigate = useNavigate();

  const recipeQuery = useGetRecipeQuery(recipeId, { skip: !recipeId });
  // Public-read / auth-write: reads are public, but cook logs, write buttons,
  // and the cook-log section are owner-only. is_owner comes from the recipe
  // response and gates all of those below.
  const isOwner = recipeQuery.data?.is_owner ?? false;
  const versionsQuery = useListVersionsQuery(recipeId, { skip: !recipeId });
  // The cook-logs endpoint 404s for non-owners, so skip it entirely unless the
  // viewer owns this recipe.
  const cooksQuery = useListRecipeCooksQuery(recipeId, {
    skip: !recipeId || !isOwner,
  });

  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [cookOpen, setCookOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteRecipe, { isLoading: isDeleting }] = useDeleteRecipeMutation();

  // Default the selected version to the recipe's latest once loaded.
  const latestVersionId = recipeQuery.data?.latest_version?.id ?? null;
  const effectiveVersionId = selectedVersionId ?? latestVersionId;

  const versionQuery = useGetVersionQuery(
    { recipeId, versionId: effectiveVersionId ?? "" },
    { skip: !recipeId || !effectiveVersionId },
  );

  const versionNumberById = useMemo(() => {
    const map: Record<string, number> = {};
    for (const v of versionsQuery.data ?? []) map[v.id] = v.version_number;
    return map;
  }, [versionsQuery.data]);

  function toggleCompare(versionId: string) {
    setCompareIds((prev) => {
      if (prev.includes(versionId)) return prev.filter((x) => x !== versionId);
      if (prev.length >= 2) return prev;
      return [...prev, versionId];
    });
  }

  function runCompare() {
    if (compareIds.length !== 2) return;
    const nums = compareIds.map((cid) => versionNumberById[cid] ?? 0);
    // Diff newer-vs-older reads most naturally: target = newer, against = older.
    const [aId, bId] = compareIds;
    const newerIsA = (nums[0] ?? 0) >= (nums[1] ?? 0);
    const targetId = newerIsA ? aId : bId;
    const againstId = newerIsA ? bId : aId;
    navigate(
      `/recipes/${recipeId}/versions/${targetId}/diff?against=${againstId}`,
    );
  }

  async function handleDelete() {
    try {
      await deleteRecipe(recipeId).unwrap();
      showSuccess("Recipe deleted.");
      navigate("/", { replace: true });
    } catch {
      showError("Couldn't delete this recipe — please try again.");
    }
  }

  if (recipeQuery.isLoading) {
    return (
      <main className="p-4 sm:p-8 space-y-6">
        <RecipeDetailSkeleton />
      </main>
    );
  }

  if (recipeQuery.isError || !recipeQuery.data) {
    return (
      <main className="p-4 sm:p-8 space-y-6">
        <EmptyState
          icon={<ChefHat className="w-12 h-12 text-destructive" />}
          heading="Recipe not found"
          body="This recipe doesn't exist. It may have been deleted."
          action={{ label: "Back to recipes", onClick: () => navigate("/") }}
        />
      </main>
    );
  }

  const recipe = recipeQuery.data;
  const versions = versionsQuery.data ?? [];

  return (
    <main className="p-4 sm:p-8 space-y-6">
      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Recipes
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold">{recipe.title}</h1>
          {recipe.description ? (
            <p className="text-muted-foreground">{recipe.description}</p>
          ) : null}
          {recipe.source ? (
            <p className="text-sm text-muted-foreground">
              Source: <span className="text-foreground">{recipe.source}</span>
            </p>
          ) : null}
        </div>
        {isOwner && (
          <div className="flex flex-wrap items-center gap-2">
            <LoadingButton
              variant="primary"
              size="sm"
              onClick={() => navigate(`/recipes/${recipeId}/tweak`)}
            >
              <span className="inline-flex items-center gap-1.5">
                <GitBranch className="w-4 h-4" />
                Tweak this recipe
              </span>
            </LoadingButton>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCookOpen(true)}
              disabled={!effectiveVersionId}
            >
              <span className="inline-flex items-center gap-1.5">
                <UtensilsCrossed className="w-4 h-4" />
                I made it
              </span>
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
              <span className="inline-flex items-center gap-1.5">
                <Pencil className="w-4 h-4" />
                Edit
              </span>
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteOpen(true)}
            >
              <span className="inline-flex items-center gap-1.5">
                <Trash2 className="w-4 h-4" />
                Delete
              </span>
            </Button>
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {versionQuery.isLoading || !versionQuery.data ? (
            <RecipeDetailSkeleton />
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  Viewing v{versionQuery.data.version_number}
                </span>
                {versionQuery.data.id === latestVersionId ? (
                  <span className="text-primary">(latest)</span>
                ) : null}
                {versionQuery.data.change_note ? (
                  <span className="truncate">— {versionQuery.data.change_note}</span>
                ) : null}
              </div>
              <VersionBody version={versionQuery.data} />
            </>
          )}

          {isOwner && (
            <section className="bg-card border rounded-lg p-6">
              <h2 className="text-base font-medium mb-4">Cook log</h2>
              <CookLogHistory
                recipeId={recipeId}
                cooks={cooksQuery.data ?? []}
                versionNumberById={versionNumberById}
              />
            </section>
          )}
        </div>

        <div className="lg:col-span-1">
          <VersionTimeline
            versions={versions}
            selectedId={effectiveVersionId}
            compareIds={compareIds}
            onSelect={setSelectedVersionId}
            onToggleCompare={toggleCompare}
            onCompare={runCompare}
          />
        </div>
      </div>

      {isOwner && effectiveVersionId && versionQuery.data ? (
        <CookLogModal
          open={cookOpen}
          onClose={() => setCookOpen(false)}
          recipeId={recipeId}
          versionId={effectiveVersionId}
          versionNumber={versionQuery.data.version_number}
        />
      ) : null}

      {isOwner && (
        <EditRecipeMetaModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          recipe={recipe}
        />
      )}

      {isOwner && (
        <ConfirmDialog
          open={deleteOpen}
          title="Delete this recipe?"
          description="This removes the recipe and its whole version history from your list. This can't be undone here."
          confirmLabel="Delete recipe"
          variant="destructive"
          isLoading={isDeleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteOpen(false)}
        />
      )}
    </main>
  );
}
