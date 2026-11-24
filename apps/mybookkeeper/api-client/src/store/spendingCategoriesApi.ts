import { baseApi } from "@platform/core/store/baseApi";
import type { SpendingCategory } from "../types/spending-category/SpendingCategory";
import type { SpendingCategoryListResponse } from "../types/spending-category/SpendingCategoryListResponse";

/**
 * Personal spending categories — user-defined, org-scoped.
 *
 * Per-id ``SpendingCategory:{id}`` plus a shared ``SpendingCategory:LIST``.
 */
export const spendingCategoriesApi = baseApi.enhanceEndpoints({
  addTagTypes: ["SpendingCategory"],
}).injectEndpoints({
  endpoints: (builder) => ({
    listSpendingCategories: builder.query<SpendingCategoryListResponse, { include_archived?: boolean } | void>({
      query: (params) => ({ url: "/spending-categories", params: params ?? {} }),
      providesTags: (result) => [
        ...(result?.items.map((c) => ({ type: "SpendingCategory" as const, id: c.id })) ?? []),
        { type: "SpendingCategory" as const, id: "LIST" },
      ],
    }),

    createSpendingCategory: builder.mutation<SpendingCategory, { name: string }>({
      query: (data) => ({ url: "/spending-categories", method: "POST", data }),
      invalidatesTags: [{ type: "SpendingCategory", id: "LIST" }],
    }),

    updateSpendingCategory: builder.mutation<SpendingCategory, { categoryId: string; name: string }>({
      query: ({ categoryId, name }) => ({ url: `/spending-categories/${categoryId}`, method: "PATCH", data: { name } }),
      invalidatesTags: (_r, _e, { categoryId }) => [
        { type: "SpendingCategory", id: categoryId },
        { type: "SpendingCategory", id: "LIST" },
      ],
    }),

    archiveSpendingCategory: builder.mutation<SpendingCategory, string>({
      query: (id) => ({ url: `/spending-categories/${id}/archive`, method: "POST" }),
      invalidatesTags: (_r, _e, id) => [
        { type: "SpendingCategory", id },
        { type: "SpendingCategory", id: "LIST" },
      ],
    }),

    unarchiveSpendingCategory: builder.mutation<SpendingCategory, string>({
      query: (id) => ({ url: `/spending-categories/${id}/unarchive`, method: "POST" }),
      invalidatesTags: (_r, _e, id) => [
        { type: "SpendingCategory", id },
        { type: "SpendingCategory", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useListSpendingCategoriesQuery,
  useCreateSpendingCategoryMutation,
  useUpdateSpendingCategoryMutation,
  useArchiveSpendingCategoryMutation,
  useUnarchiveSpendingCategoryMutation,
} = spendingCategoriesApi;
