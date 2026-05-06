import { baseApi } from "@platform/ui";
import type { NavDirection } from "@/features/resume_refinement/nav-direction";
import type { RefinementSession } from "@/types/resume-refinement/refinement-session";

const REFINEMENT_TAG = "RefinementSession";

const resumeRefinementApi = baseApi
  .enhanceEndpoints({ addTagTypes: [REFINEMENT_TAG] })
  .injectEndpoints({
    endpoints: (build) => ({
      startRefinementSession: build.mutation<RefinementSession, { source_resume_job_id: string }>({
        query: (body) => ({
          url: "/resume-refinement/sessions",
          method: "POST",
          data: body,
        }),
        invalidatesTags: [{ type: REFINEMENT_TAG, id: "LIST" }],
      }),

      getRefinementSession: build.query<RefinementSession, string>({
        query: (id) => ({ url: `/resume-refinement/sessions/${id}`, method: "GET" }),
        providesTags: (_result, _err, id) => [{ type: REFINEMENT_TAG, id }],
      }),

      acceptPending: build.mutation<RefinementSession, string>({
        query: (id) => ({
          url: `/resume-refinement/sessions/${id}/accept`,
          method: "POST",
          data: {},
        }),
        invalidatesTags: (_result, _err, id) => [{ type: REFINEMENT_TAG, id }],
      }),

      supplyCustomRewrite: build.mutation<RefinementSession, { id: string; user_text: string }>({
        query: ({ id, user_text }) => ({
          url: `/resume-refinement/sessions/${id}/custom`,
          method: "POST",
          data: { user_text },
        }),
        invalidatesTags: (_result, _err, { id }) => [{ type: REFINEMENT_TAG, id }],
      }),

      requestAlternative: build.mutation<RefinementSession, { id: string; hint?: string }>({
        query: ({ id, hint }) => ({
          url: `/resume-refinement/sessions/${id}/alternative`,
          method: "POST",
          data: { hint: hint ?? null },
        }),
        invalidatesTags: (_result, _err, { id }) => [{ type: REFINEMENT_TAG, id }],
      }),

      skipTarget: build.mutation<RefinementSession, string>({
        query: (id) => ({
          url: `/resume-refinement/sessions/${id}/skip`,
          method: "POST",
          data: {},
        }),
        invalidatesTags: (_result, _err, id) => [{ type: REFINEMENT_TAG, id }],
      }),

      navigateRefinement: build.mutation<
        RefinementSession,
        { id: string; direction: NavDirection }
      >({
        query: ({ id, direction }) => ({
          url: `/resume-refinement/sessions/${id}/navigate`,
          method: "POST",
          data: { direction },
        }),
        invalidatesTags: (_result, _err, { id }) => [{ type: REFINEMENT_TAG, id }],
      }),

      completeRefinementSession: build.mutation<RefinementSession, string>({
        query: (id) => ({
          url: `/resume-refinement/sessions/${id}/complete`,
          method: "POST",
          data: {},
        }),
        invalidatesTags: (_result, _err, id) => [{ type: REFINEMENT_TAG, id }],
      }),
    }),
  });

export const {
  useStartRefinementSessionMutation,
  useGetRefinementSessionQuery,
  useAcceptPendingMutation,
  useSupplyCustomRewriteMutation,
  useRequestAlternativeMutation,
  useSkipTargetMutation,
  useNavigateRefinementMutation,
  useCompleteRefinementSessionMutation,
} = resumeRefinementApi;
