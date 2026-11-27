import { baseApi } from "@platform/core/store/baseApi";
import type { ClassificationRule } from "../types/classification-rule/classification-rule";
import type { ClassificationRuleCreate } from "../types/classification-rule/classification-rule-create";
import type { RuleAppliedToPast } from "../types/classification-rule/rule-applied-to-past";
import type { RulePastMatches } from "../types/classification-rule/rule-past-matches";

/**
 * Classification (vendor / payee) rules. Reads are open to any member; writes and
 * the past-payment count are owner/admin only. There is no update endpoint: creating
 * a rule with the same match replaces it. Writes invalidate the whole
 * ``ClassificationRule`` tag; applying a rule to past payments refiles transactions.
 */
export const classificationRulesApi = baseApi.enhanceEndpoints({
  addTagTypes: ["ClassificationRule", "Transaction", "Summary", "TaxReturn"],
}).injectEndpoints({
  endpoints: (builder) => ({
    listClassificationRules: builder.query<ClassificationRule[], void>({
      query: () => ({ url: "/classification-rules" }),
      providesTags: (result) =>
        result
          ? [...result.map((r) => ({ type: "ClassificationRule" as const, id: r.id })), { type: "ClassificationRule", id: "LIST" }]
          : [{ type: "ClassificationRule", id: "LIST" }],
    }),
    createClassificationRule: builder.mutation<ClassificationRule, ClassificationRuleCreate>({
      query: (body) => ({ url: "/classification-rules", method: "POST", data: body }),
      invalidatesTags: ["ClassificationRule"],
    }),
    deleteClassificationRule: builder.mutation<void, string>({
      query: (id) => ({ url: `/classification-rules/${id}`, method: "DELETE" }),
      invalidatesTags: ["ClassificationRule"],
    }),
    // Always asked fresh: the answer is a confirm count, and past payments change under it.
    getRulePastMatches: builder.query<RulePastMatches, string>({
      query: (id) => ({ url: `/classification-rules/${id}/past-matches` }),
      keepUnusedDataFor: 0,
    }),
    applyRuleToPast: builder.mutation<RuleAppliedToPast, string>({
      query: (id) => ({ url: `/classification-rules/${id}/apply-to-past`, method: "POST" }),
      invalidatesTags: ["ClassificationRule", "Transaction", "Summary", "TaxReturn"],
    }),
  }),
});

export const {
  useListClassificationRulesQuery,
  useCreateClassificationRuleMutation,
  useDeleteClassificationRuleMutation,
  useLazyGetRulePastMatchesQuery,
  useApplyRuleToPastMutation,
} = classificationRulesApi;
