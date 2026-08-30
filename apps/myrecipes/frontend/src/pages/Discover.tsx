import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Compass, Search } from "lucide-react";
import { AlertBox, EmptyState, LoadingButton } from "@platform/ui";
import DiscoveryCard from "@/features/discovery/DiscoveryCard";
import DiscoveryDetailView from "@/features/discovery/DiscoveryDetailView";
import DiscoveryResultsSkeleton from "@/features/discovery/DiscoveryResultsSkeleton";
import DiscoveryStatus from "@/features/discovery/DiscoveryStatus";
import EditorHeader from "@/features/recipes/EditorHeader";
import RecipeEditorForm from "@/features/recipes/RecipeEditorForm";
import {
  useReadWebRecipeMutation,
  useSearchWebRecipesMutation,
} from "@/store/discoveryApi";
import { DISCOVER_EMPTY_STATE, DISCOVER_SUGGESTIONS } from "@/constants/empty-states";
import type {
  DiscoveredDetail,
  DiscoveredRecipe,
  DiscoveryResults,
} from "@/types/recipe/discovery";

const SEARCH_STAGES = [
  "Searching the web for versions of this dish...",
  "Reading through what we found...",
  "Comparing the versions worth cooking...",
] as const;

const READ_STAGES = [
  "Opening the recipe...",
  "Reading the ingredients and method...",
  "Pulling out the tips and what cooks report...",
] as const;

function searchErrorMessage(err: unknown): string {
  const status = (err as { status?: number } | null)?.status;
  if (status === 422) {
    return "We couldn't find recipes for that. Try a dish name, like “mexican flan”.";
  }
  if (status === 429) {
    return "You've run a lot of searches in the last hour. Give it a few minutes and try again.";
  }
  if (status === 503) {
    return "Recipe discovery isn't available right now. Try again shortly.";
  }
  return "Something went wrong searching — please try again.";
}

function readErrorMessage(err: unknown): string {
  const status = (err as { status?: number } | null)?.status;
  if (status === 422) {
    return "We couldn't read a recipe off that page. Open the original to see it.";
  }
  if (status === 400) {
    return "That page can't be opened from here.";
  }
  if (status === 429) {
    return "You've opened a lot of recipes in the last hour. Give it a few minutes.";
  }
  return "We couldn't open that one — try another result.";
}

/**
 * Discover recipes from the web (/discover).
 *
 * Two paid, slow calls, so the flow is built around not spending either one by
 * accident:
 *
 *   browse  — a query box; searching is an explicit submit, never a remount or
 *             a cache miss (both endpoints are mutations for this reason).
 *   detail  — clicking a card reads that one page in full. Results stay in
 *             state behind it and reads are memoised per result, so moving
 *             back and forth through the list is free after the first open.
 *   save    — the draft drops into the ordinary recipe editor for review, the
 *             same way photo import does, and saves through POST /recipes.
 *
 * Everything is transient and none of it is reconstructible from a URL — same
 * reasoning as the photo-import flow — so the step lives in component state
 * rather than in the route.
 */
export default function Discover() {
  const [input, setInput] = useState("");
  const [results, setResults] = useState<DiscoveryResults | null>(null);
  const [selected, setSelected] = useState<DiscoveredRecipe | null>(null);
  const [detailsById, setDetailsById] = useState<Record<string, DiscoveredDetail>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchWebRecipes, { isLoading: isSearching }] = useSearchWebRecipesMutation();
  const [readWebRecipe, { isLoading: isReading }] = useReadWebRecipeMutation();

  const detail = selected ? (detailsById[selected.id] ?? null) : null;
  const isBusy = isSearching || isReading;

  // Warn before a browser close or refresh throws away an in-flight call —
  // the request keeps running server-side and the answer would be lost.
  useEffect(() => {
    if (!isBusy) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isBusy]);

  async function runSearch(rawQuery: string) {
    const query = rawQuery.trim();
    if (query.length < 2 || isBusy) return;
    setInput(query);
    setError(null);
    setSelected(null);
    setIsSaving(false);
    try {
      setResults(await searchWebRecipes(query).unwrap());
    } catch (err) {
      setResults(null);
      setError(searchErrorMessage(err));
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void runSearch(input);
  }

  async function openResult(recipe: DiscoveredRecipe) {
    if (isBusy) return;
    setError(null);
    setSelected(recipe);
    if (detailsById[recipe.id]) return; // already read once — free
    try {
      const read = await readWebRecipe({
        url: recipe.url,
        title: recipe.title,
      }).unwrap();
      setDetailsById((prev) => ({ ...prev, [recipe.id]: read }));
    } catch (err) {
      setSelected(null);
      setError(readErrorMessage(err));
    }
  }

  function backToResults() {
    setSelected(null);
    setIsSaving(false);
    setError(null);
  }

  // Save step — the editor is seeded with the read draft, with the original
  // page recorded as the source so the provenance survives the save.
  if (isSaving && detail) {
    const attribution = detail.site_name
      ? `${detail.site_name} (${detail.url})`
      : detail.url;
    return (
      <main className="space-y-6 p-4 sm:p-8">
        <EditorHeader
          backTo="/discover"
          backLabel="Discover"
          title="Save this recipe"
          subtitle="We've filled in what the page said — check anything that looks off, then save it to your recipes."
        />
        <RecipeEditorForm
          mode="create"
          initialDraft={{
            ...detail.draft,
            source: detail.draft.source ? attribution : detail.url,
          }}
          onCancel={() => setIsSaving(false)}
        />
      </main>
    );
  }

  // Detail step — reading one result, or the read itself.
  if (selected) {
    return (
      <main className="space-y-6 p-4 sm:p-8">
        {detail ? (
          <DiscoveryDetailView
            detail={detail}
            onBack={backToResults}
            onSave={() => setIsSaving(true)}
          />
        ) : (
          <div className="space-y-4">
            <h1 className="text-2xl font-semibold leading-tight">{selected.title}</h1>
            <DiscoveryStatus stages={READ_STAGES} />
            <DiscoveryResultsSkeleton />
          </div>
        )}
      </main>
    );
  }

  let content: ReactNode;
  if (isSearching) {
    content = (
      <div className="space-y-4">
        <DiscoveryStatus stages={SEARCH_STAGES} />
        <DiscoveryResultsSkeleton />
      </div>
    );
  } else if (results && results.recipes.length > 0) {
    content = (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {results.recipes.length} version
          {results.recipes.length === 1 ? "" : "s"} of{" "}
          <span className="text-foreground">{results.query}</span>, best first.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.recipes.map((recipe) => (
            <DiscoveryCard key={recipe.id} recipe={recipe} onOpen={openResult} />
          ))}
        </div>
      </div>
    );
  } else {
    content = (
      <EmptyState
        icon={<Compass className="h-12 w-12" />}
        heading={DISCOVER_EMPTY_STATE.heading}
        body={DISCOVER_EMPTY_STATE.body}
      />
    );
  }

  return (
    <main className="space-y-6 p-4 sm:p-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Discover recipes</h1>
        <p className="text-sm text-muted-foreground">
          Name a dish and we'll search recipe sites, food blogs, YouTube and Reddit for
          the versions worth cooking.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] max-w-md flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="What do you want to make?"
            aria-label="Dish to search the web for"
            disabled={isSearching}
            className="min-h-[44px] w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
          />
        </div>
        <LoadingButton
          type="submit"
          isLoading={isSearching}
          loadingText="Searching..."
          disabled={input.trim().length < 2}
        >
          Search the web
        </LoadingButton>
      </form>

      {!results && !isSearching ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Try:</span>
          {DISCOVER_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => void runSearch(suggestion)}
              className="min-h-[36px] rounded-full border bg-background px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}

      {error ? <AlertBox variant="warning">{error}</AlertBox> : null}

      {content}
    </main>
  );
}
