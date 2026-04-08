import { baseApi } from "./baseApi";
import type { ClassificationRule } from "@/shared/types/classification-rule/classification-rule";

const classificationRulesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listClassificationRules: builder.query<ClassificationRule[], void>({
      query: () => ({ url: "/classification-rules" }),
      providesTags: (result) =>
        result
          ? [...result.map((r) => ({ type: "ClassificationRule" as const, id: r.id })), { type: "ClassificationRule", id: "LIST" }]
          : [{ type: "ClassificationRule", id: "LIST" }],
    }),
    createClassificationRule: builder.mutation<ClassificationRule, { match_type: string; match_pattern: string; category: string; match_context?: string; property_id?: string; activity_id?: string }>({
      query: (data) => ({ url: "/classification-rules", method: "POST", data }),
      invalidatesTags: ["ClassificationRule"],
    }),
    deleteClassificationRule: builder.mutation<void, string>({
      query: (id) => ({ url: `/classification-rules/${id}`, method: "DELETE" }),
      invalidatesTags: ["ClassificationRule"],
    }),
  }),
});

export const {
  useListClassificationRulesQuery,
  useCreateClassificationRuleMutation,
  useDeleteClassificationRuleMutation,
} = classificationRulesApi;
