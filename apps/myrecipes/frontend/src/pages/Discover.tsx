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
} from "@myrecipes/api-client/store/discoveryApi";
import {
  DISCOVERY_EMPTY_COPY,
  DISCOVERY_INTRO,
  DISCOVERY_QUERY_MAX_LENGTH,
  DISCOVERY_QUERY_MIN_LENGTH,
  DISCOVERY_QUERY_PLACEHOLDER,
  DISCOVERY_READ_STAGES,
  DISCOVERY_SEARCH_STAGES,
  DISCOVERY_SUGGESTIONS,
} from "@myrecipes/api-client/constants/discovery";
import { discoveredRecipeDraft } from "@myrecipes/api-client/utils/discoveredRecipeDraft";
import { discoveryReadErrorMessage } from "@myrecipes/api-client/utils/discoveryReadErrorMessage";
import { discoverySearchErrorMessage } from "@myrecipes/api-client/utils/discoverySearchErrorMessage";
import type {
  DiscoveredDetail,
  DiscoveredRecipe,
  DiscoveryResults,
} from "@myrecipes/api-client/types/recipe/discovery";

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
    if (query.length < DISCOVERY_QUERY_MIN_LENGTH || isBusy) return;
    setInput(query);
    setError(null);
    setSelected(null);
    setIsSaving(false);
    try {
      setResults(await searchWebRecipes(query).unwrap());
    } catch (err) {
      setResults(null);
      setError(discoverySearchErrorMessage(err));
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
      setError(discoveryReadErrorMessage(err));
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
    return (
      <div className="space-y-6 p-4 sm:p-8">
        <EditorHeader
          backTo="/discover"
          backLabel="Discover"
          title="Save this recipe"
          subtitle="We've filled in what the page said — check anything that looks off, then save it to your recipes."
        />
        <RecipeEditorForm
          mode="create"
          initialDraft={discoveredRecipeDraft(detail)}
          onCancel={() => setIsSaving(false)}
        />
      </div>
    );
  }

  // Detail step — reading one result, or the read itself.
  if (selected) {
    return (
      <div className="space-y-6 p-4 sm:p-8">
        {detail ? (
          <DiscoveryDetailView
            detail={detail}
            onBack={backToResults}
            onSave={() => setIsSaving(true)}
          />
        ) : (
          <div className="space-y-4">
            <h1 className="text-2xl font-semibold leading-tight">{selected.title}</h1>
            <DiscoveryStatus stages={DISCOVERY_READ_STAGES} />
            <DiscoveryResultsSkeleton />
          </div>
        )}
      </div>
    );
  }

  let content: ReactNode;
  if (isSearching) {
    content = (
      <div className="space-y-4">
        <DiscoveryStatus stages={DISCOVERY_SEARCH_STAGES} />
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
        heading={DISCOVERY_EMPTY_COPY.heading}
        body={DISCOVERY_EMPTY_COPY.body}
      />
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Discover recipes</h1>
        <p className="text-sm text-muted-foreground">{DISCOVERY_INTRO}</p>
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
            placeholder={DISCOVERY_QUERY_PLACEHOLDER}
            maxLength={DISCOVERY_QUERY_MAX_LENGTH}
            aria-label="Dish to search the web for"
            disabled={isSearching}
            className="min-h-[44px] w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
          />
        </div>
        <LoadingButton
          type="submit"
          isLoading={isSearching}
          loadingText="Searching..."
          disabled={input.trim().length < DISCOVERY_QUERY_MIN_LENGTH}
        >
          Search the web
        </LoadingButton>
      </form>

      {!results && !isSearching ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Try:</span>
          {DISCOVERY_SUGGESTIONS.map((suggestion) => (
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
    </div>
  );
}
