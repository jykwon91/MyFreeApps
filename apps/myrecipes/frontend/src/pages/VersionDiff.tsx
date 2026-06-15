import { useMemo } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, GitCompare } from "lucide-react";
import { EmptyState, LoadingButton, Skeleton } from "@platform/ui";
import { useGetDiffQuery } from "@/store/recipesApi";
import DiffRow from "@/features/recipes/DiffRow";
import { formatIngredientLine } from "@/features/recipes/IngredientLine";
import type { IngredientChange } from "@/types/recipe/diff";

function ingredientLine(change: IngredientChange, side: "before" | "after"): string | null {
  const snapshot = change[side];
  return snapshot ? formatIngredientLine(snapshot) : null;
}

/**
 * The version diff — the signature screen. Renders ingredient_changes and
 * step_changes between two versions so "what changed and did it get better" is
 * obvious at a glance: additions in green, removals in red, edits as
 * before -> after in amber.
 */
export default function VersionDiff() {
  const { id, vid } = useParams<{ id: string; vid: string }>();
  const recipeId = id ?? "";
  const versionId = vid ?? "";
  const [searchParams] = useSearchParams();
  const against = searchParams.get("against") ?? undefined;
  const navigate = useNavigate();

  const { data, isLoading, isError } = useGetDiffQuery(
    { recipeId, versionId, against },
    { skip: !recipeId || !versionId },
  );

  const totalChanges = useMemo(
    () => (data ? data.ingredient_changes.length + data.step_changes.length : 0),
    [data],
  );

  const backLink = (
    <Link
      to={`/recipes/${recipeId}`}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="w-4 h-4" />
      Back to recipe
    </Link>
  );

  if (isLoading) {
    return (
      <main className="p-4 sm:p-8 space-y-6">
        {backLink}
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </main>
    );
  }

  if (isError || !data) {
    return (
      <main className="p-4 sm:p-8 space-y-6">
        {backLink}
        <EmptyState
          icon={<GitCompare className="w-12 h-12 text-destructive" />}
          heading="Couldn't load this comparison"
          body="One of these versions may not exist. Go back and pick two versions to compare."
          action={{
            label: "Back to recipe",
            onClick: () => navigate(`/recipes/${recipeId}`),
          }}
        />
      </main>
    );
  }

  const fromLabel =
    data.from_version_number === null ? "nothing" : `v${data.from_version_number}`;

  return (
    <main className="p-4 sm:p-8 space-y-6">
      {backLink}

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <GitCompare className="w-6 h-6 text-primary" aria-hidden />
          {fromLabel} <span className="text-muted-foreground">to</span> v
          {data.to_version_number}
        </h1>
        <p className="text-sm text-muted-foreground">
          {totalChanges === 0
            ? "No differences between these versions."
            : `${totalChanges} change${totalChanges === 1 ? "" : "s"} — ${data.ingredient_changes.length} ingredient, ${data.step_changes.length} step.`}
        </p>
      </header>

      {totalChanges === 0 ? (
        <EmptyState
          icon={<GitCompare className="w-12 h-12" />}
          heading="Identical"
          body="These two versions have the same ingredients and steps."
        />
      ) : (
        <div className="space-y-6">
          <section className="bg-card border rounded-lg p-6">
            <h2 className="text-base font-medium mb-3">Ingredients</h2>
            {data.ingredient_changes.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No ingredient changes.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.ingredient_changes.map((change) => (
                  <DiffRow
                    key={change.lineage_key}
                    change={change.change}
                    before={ingredientLine(change, "before")}
                    after={ingredientLine(change, "after")}
                  />
                ))}
              </ul>
            )}
          </section>

          <section className="bg-card border rounded-lg p-6">
            <h2 className="text-base font-medium mb-3">Steps</h2>
            {data.step_changes.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No step changes.</p>
            ) : (
              <ul className="space-y-2">
                {data.step_changes.map((change) => (
                  <DiffRow
                    key={`${change.position}-${change.change}`}
                    change={change.change}
                    before={change.before}
                    after={change.after}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <div className="flex justify-end">
        <LoadingButton
          variant="secondary"
          onClick={() => navigate(`/recipes/${recipeId}/tweak`)}
        >
          Tweak this recipe
        </LoadingButton>
      </div>
    </main>
  );
}
