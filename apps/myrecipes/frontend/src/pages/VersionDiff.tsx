import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, GitCompare } from "lucide-react";
import { EmptyState, LoadingButton, Skeleton } from "@platform/ui";
import { useGetDiffQuery, useGetRecipeQuery } from "@myrecipes/api-client/store/recipesApi";
import { VERSION_COPY } from "@myrecipes/api-client/constants/versions";
import { diffErrorMessage } from "@myrecipes/api-client/utils/diffErrorMessage";
import { diffSummary } from "@myrecipes/api-client/utils/diffSummary";
import { ingredientChangeLine } from "@myrecipes/api-client/utils/ingredientChangeLine";
import DiffRow from "@/features/recipes/DiffRow";

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

  const { data, error, isLoading, isError } = useGetDiffQuery(
    { recipeId, versionId, against },
    { skip: !recipeId || !versionId },
  );

  // The diff is public, but "Tweak this recipe" is a write action gated to the
  // owner. Fetch the recipe to read is_owner (cached from the detail page).
  const recipeQuery = useGetRecipeQuery(recipeId, { skip: !recipeId });
  const isOwner = recipeQuery.data?.is_owner ?? false;

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
      <div className="p-4 sm:p-8 space-y-6">
        {backLink}
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-4 sm:p-8 space-y-6">
        {backLink}
        <EmptyState
          icon={<GitCompare className="w-12 h-12 text-destructive" />}
          heading={VERSION_COPY.loadFailedHeading}
          body={diffErrorMessage(error)}
          action={{
            label: "Back to recipe",
            onClick: () => navigate(`/recipes/${recipeId}`),
          }}
        />
      </div>
    );
  }

  const summary = diffSummary(data);

  return (
    <div className="p-4 sm:p-8 space-y-6">
      {backLink}

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <GitCompare className="w-6 h-6 text-primary" aria-hidden />
          {summary.fromLabel} <span className="text-muted-foreground">{VERSION_COPY.to}</span>{" "}
          {summary.toLabel}
        </h1>
        <p className="text-sm text-muted-foreground">{summary.subtitle}</p>
      </header>

      {summary.isIdentical ? (
        <EmptyState
          icon={<GitCompare className="w-12 h-12" />}
          heading={VERSION_COPY.identicalHeading}
          body={VERSION_COPY.identicalBody}
        />
      ) : (
        <div className="space-y-6">
          <section className="bg-card border rounded-lg p-6">
            <h2 className="text-base font-medium mb-3">{VERSION_COPY.ingredients}</h2>
            {data.ingredient_changes.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                {VERSION_COPY.noIngredientChanges}
              </p>
            ) : (
              <ul className="space-y-2">
                {data.ingredient_changes.map((change) => (
                  <DiffRow
                    key={change.lineage_key}
                    change={change.change}
                    before={ingredientChangeLine(change, "before")}
                    after={ingredientChangeLine(change, "after")}
                  />
                ))}
              </ul>
            )}
          </section>

          <section className="bg-card border rounded-lg p-6">
            <h2 className="text-base font-medium mb-3">{VERSION_COPY.steps}</h2>
            {data.step_changes.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">{VERSION_COPY.noStepChanges}</p>
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

      {isOwner ? (
        <div className="flex justify-end">
          <LoadingButton
            variant="secondary"
            onClick={() => navigate(`/recipes/${recipeId}/tweak`)}
          >
            Tweak this recipe
          </LoadingButton>
        </div>
      ) : null}
    </div>
  );
}
