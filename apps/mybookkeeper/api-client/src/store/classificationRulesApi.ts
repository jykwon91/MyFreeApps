import { baseApi } from "@platform/core/store/baseApi";
import type { ClassificationRule } from "../types/classification-rule/classification-rule";

/**
 * Vendor (classification) rules. Reads are open to any member; delete is owner/admin only.
 * There is no update endpoint. Delete invalidates the whole ``ClassificationRule`` tag.
 */
export const classificationRulesApi = baseApi.enhanceEndpoints({
  addTagTypes: ["ClassificationRule"],
}).injectEndpoints({
  endpoints: (builder) => ({
    listClassificationRules: builder.query<ClassificationRule[], void>({
      query: () => ({ url: "/classification-rules" }),
      providesTags: (result) =>
        result
          ? [...result.map((r) => ({ type: "ClassificationRule" as const, id: r.id })), { type: "ClassificationRule", id: "LIST" }]
          : [{ type: "ClassificationRule", id: "LIST" }],
    }),
    deleteClassificationRule: builder.mutation<void, string>({
      query: (id) => ({ url: `/classification-rules/${id}`, method: "DELETE" }),
      invalidatesTags: ["ClassificationRule"],
    }),
  }),
});

export const {
  useListClassificationRulesQuery,
  useDeleteClassificationRuleMutation,
} = classificationRulesApi;
