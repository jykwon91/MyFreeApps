import { baseApi } from "@platform/ui";
import type { DiscoveredDetail, DiscoveryResults } from "@/types/recipe/discovery";

/**
 * Web recipe discovery.
 *
 * Both endpoints are **mutations**, not queries, even though they only read.
 * Each one spends real money (a Claude call with web search) and takes tens of
 * seconds, so firing must be an explicit user action — never something a
 * remount or a cache miss can trigger on its own. The per-IP throttle on the
 * backend is the ceiling; this is the reason it is rarely approached.
 *
 * Nothing here persists, so no cache tags are invalidated. Saving a discovered
 * recipe goes through `createRecipe`, which invalidates the recipes list.
 */
const discoveryApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    searchWebRecipes: build.mutation<DiscoveryResults, string>({
      query: (searchQuery) => ({
        url: "/discovery/search",
        method: "POST",
        data: { query: searchQuery },
      }),
    }),
    readWebRecipe: build.mutation<DiscoveredDetail, { url: string; title?: string }>({
      query: ({ url, title }) => ({
        url: "/discovery/detail",
        method: "POST",
        data: { url, title: title ?? "" },
      }),
    }),
  }),
});

export const { useSearchWebRecipesMutation, useReadWebRecipeMutation } = discoveryApi;
export default discoveryApi;
