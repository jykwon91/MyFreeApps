import { baseApi } from "@platform/ui";
import type { RecipeSummary, RecipeDetailResponse } from "@/types/recipe/recipe";
import type { VersionResponse, VersionSummary } from "@/types/recipe/version";
import type { DiffResponse } from "@/types/recipe/diff";
import type { CookLogResponse } from "@/types/recipe/cook-log";
import type {
  RecipeCreateRequest,
  RecipeUpdateRequest,
  VersionCreateRequest,
} from "@/types/recipe/recipe-requests";
import type { CookLogCreateRequest } from "@/types/recipe/cook-log";
import type { RecipeExtractionDraft } from "@/types/recipe/extraction";

/**
 * Cache tags scoped to one recipe id so a tweak / cook / metadata edit
 * invalidates exactly the queries that depend on the changed data:
 *
 *   - "Recipe"   — the recipes list + a single recipe's detail
 *   - "Version"  — a recipe's timeline + a single version body
 *   - "CookLog"  — a recipe's / a version's cook logs
 *
 * A tweak (POST /versions) invalidates Version (timeline changes) AND Recipe
 * (the detail's latest_version + the list's rollups change). A cook
 * (POST /cooks) invalidates CookLog AND Version (best_rating/cook_count
 * rollups on the timeline) AND Recipe (list best_rating/last_cooked_at).
 */
const apiWithTags = baseApi.enhanceEndpoints({
  addTagTypes: ["Recipe", "Version", "CookLog"],
});

/**
 * Arguments for the recipes list query.
 *
 * Public-read / auth-write: ``search`` free-text filters the public library;
 * ``owner: "me"`` narrows to the signed-in user's own recipes (the "My recipes"
 * filter chip, rendered only when authenticated).
 */
export interface ListRecipesArgs {
  search?: string;
  owner?: "me";
}

const recipesApi = apiWithTags.injectEndpoints({
  endpoints: (build) => ({
    // ---- Recipes -------------------------------------------------------
    listRecipes: build.query<RecipeSummary[], ListRecipesArgs | void>({
      query: (args) => {
        const { search, owner } = args ?? {};
        const params: Record<string, string> = {};
        if (search) params.search = search;
        if (owner) params.owner = owner;
        return {
          url: "/recipes",
          method: "GET",
          params: Object.keys(params).length > 0 ? params : undefined,
        };
      },
      providesTags: (result) =>
        result
          ? [
              ...result.map((r) => ({ type: "Recipe" as const, id: r.id })),
              { type: "Recipe" as const, id: "LIST" },
            ]
          : [{ type: "Recipe" as const, id: "LIST" }],
    }),
    getRecipe: build.query<RecipeDetailResponse, string>({
      query: (recipeId) => ({ url: `/recipes/${recipeId}`, method: "GET" }),
      providesTags: (_result, _error, recipeId) => [
        { type: "Recipe", id: recipeId },
      ],
    }),
    createRecipe: build.mutation<RecipeDetailResponse, RecipeCreateRequest>({
      query: (data) => ({ url: "/recipes", method: "POST", data }),
      invalidatesTags: [{ type: "Recipe", id: "LIST" }],
    }),
    // Photo import: a synchronous Claude vision call returning an editable
    // draft. Saving goes through createRecipe, so this persists nothing and
    // invalidates no cache tags. The body is multipart FormData.
    extractRecipeFromPhoto: build.mutation<RecipeExtractionDraft, FormData>({
      query: (data) => ({ url: "/recipes/extract", method: "POST", data }),
    }),
    updateRecipe: build.mutation<
      RecipeDetailResponse,
      { recipeId: string; body: RecipeUpdateRequest }
    >({
      query: ({ recipeId, body }) => ({
        url: `/recipes/${recipeId}`,
        method: "PATCH",
        data: body,
      }),
      invalidatesTags: (_result, _error, { recipeId }) => [
        { type: "Recipe", id: recipeId },
        { type: "Recipe", id: "LIST" },
      ],
    }),
    deleteRecipe: build.mutation<void, string>({
      query: (recipeId) => ({ url: `/recipes/${recipeId}`, method: "DELETE" }),
      invalidatesTags: (_result, _error, recipeId) => [
        { type: "Recipe", id: recipeId },
        { type: "Recipe", id: "LIST" },
      ],
    }),

    // ---- Versions ------------------------------------------------------
    listVersions: build.query<VersionSummary[], string>({
      query: (recipeId) => ({
        url: `/recipes/${recipeId}/versions`,
        method: "GET",
      }),
      providesTags: (_result, _error, recipeId) => [
        { type: "Version", id: recipeId },
      ],
    }),
    getVersion: build.query<
      VersionResponse,
      { recipeId: string; versionId: string }
    >({
      query: ({ recipeId, versionId }) => ({
        url: `/recipes/${recipeId}/versions/${versionId}`,
        method: "GET",
      }),
      providesTags: (_result, _error, { versionId }) => [
        { type: "Version", id: versionId },
      ],
    }),
    getDiff: build.query<
      DiffResponse,
      { recipeId: string; versionId: string; against?: string }
    >({
      query: ({ recipeId, versionId, against }) => ({
        url: `/recipes/${recipeId}/versions/${versionId}/diff`,
        method: "GET",
        params: against ? { against } : undefined,
      }),
    }),
    createVersion: build.mutation<
      VersionResponse,
      { recipeId: string; body: VersionCreateRequest }
    >({
      query: ({ recipeId, body }) => ({
        url: `/recipes/${recipeId}/versions`,
        method: "POST",
        data: body,
      }),
      invalidatesTags: (_result, _error, { recipeId }) => [
        { type: "Version", id: recipeId },
        { type: "Recipe", id: recipeId },
        { type: "Recipe", id: "LIST" },
      ],
    }),
    restoreVersion: build.mutation<
      VersionResponse,
      { recipeId: string; versionId: string }
    >({
      query: ({ recipeId, versionId }) => ({
        url: `/recipes/${recipeId}/versions/${versionId}/restore`,
        method: "POST",
      }),
      invalidatesTags: (_result, _error, { recipeId }) => [
        { type: "Version", id: recipeId },
        { type: "Recipe", id: recipeId },
        { type: "Recipe", id: "LIST" },
      ],
    }),

    // ---- Cook logs -----------------------------------------------------
    listRecipeCooks: build.query<CookLogResponse[], string>({
      query: (recipeId) => ({
        url: `/recipes/${recipeId}/cooks`,
        method: "GET",
      }),
      providesTags: (_result, _error, recipeId) => [
        { type: "CookLog", id: recipeId },
      ],
    }),
    logCook: build.mutation<
      CookLogResponse,
      { recipeId: string; versionId: string; body: CookLogCreateRequest }
    >({
      query: ({ recipeId, versionId, body }) => ({
        url: `/recipes/${recipeId}/versions/${versionId}/cooks`,
        method: "POST",
        data: body,
      }),
      invalidatesTags: (_result, _error, { recipeId }) => [
        { type: "CookLog", id: recipeId },
        { type: "Version", id: recipeId },
        { type: "Recipe", id: recipeId },
        { type: "Recipe", id: "LIST" },
      ],
    }),
    deleteCook: build.mutation<
      void,
      { recipeId: string; cookId: string }
    >({
      query: ({ recipeId, cookId }) => ({
        url: `/recipes/${recipeId}/cooks/${cookId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, { recipeId }) => [
        { type: "CookLog", id: recipeId },
        { type: "Version", id: recipeId },
        { type: "Recipe", id: recipeId },
        { type: "Recipe", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useListRecipesQuery,
  useGetRecipeQuery,
  useCreateRecipeMutation,
  useExtractRecipeFromPhotoMutation,
  useUpdateRecipeMutation,
  useDeleteRecipeMutation,
  useListVersionsQuery,
  useGetVersionQuery,
  useGetDiffQuery,
  useCreateVersionMutation,
  useRestoreVersionMutation,
  useListRecipeCooksQuery,
  useLogCookMutation,
  useDeleteCookMutation,
} = recipesApi;
