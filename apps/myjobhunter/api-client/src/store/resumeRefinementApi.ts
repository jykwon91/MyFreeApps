import { MODEL_REQUEST_TIMEOUT_MS } from "@platform/core/constants/requestTimeouts";
import { baseApi } from "@platform/core/store/baseApi";
import type { TagDescription } from "@reduxjs/toolkit/query";
import type { AlternativeRequestArgs } from "../types/resume-refinement/alternative-request-args";
import type { CustomRewriteArgs } from "../types/resume-refinement/custom-rewrite-args";
import type { NavDirection } from "../types/resume-refinement/nav-direction";
import type { RefinementAnswerArgs } from "../types/resume-refinement/refinement-answer-args";
import type { RefinementSession } from "../types/resume-refinement/refinement-session";
import { isOlderSessionReply } from "../utils/isOlderSessionReply";
import { keepReturnedSession } from "../utils/keepReturnedSession";

const REFINEMENT_TAG = "RefinementSession" as const;

// Every action answers with the whole updated session, and that answer goes straight into the cache: the screen
// moves to the next suggestion in the same moment the button stops spinning. Waiting on a reload instead left the
// answered suggestion up with its buttons live, so a second tap answered one the user never saw. A failed action
// reloads the session instead, since it may have gone through before the answer was lost.
function reloadOnFailure(result: RefinementSession | undefined, id: string): TagDescription<typeof REFINEMENT_TAG>[] {
  return result ? [] : [{ type: REFINEMENT_TAG, id }];
}

export const resumeRefinementApi = baseApi
  .enhanceEndpoints({ addTagTypes: [REFINEMENT_TAG] })
  .injectEndpoints({
    endpoints: (build) => ({
      startRefinementSession: build.mutation<RefinementSession, { source_resume_job_id: string }>({
        query: (body) => ({
          url: "/resume-refinement/sessions",
          method: "POST",
          data: body,
        }),
        // The started session goes into the cache as soon as the server returns it, so the screen
        // shows it at once instead of waiting on a first fetch.
        async onQueryStarted(_body, { dispatch, queryFulfilled }) {
          await keepReturnedSession(queryFulfilled, (session) =>
            dispatch(resumeRefinementApi.util.upsertQueryData("getRefinementSession", session.id, session)),
          );
        },
      }),

      getRefinementSession: build.query<RefinementSession, string>({
        query: (id) => ({ url: `/resume-refinement/sessions/${id}`, method: "GET" }),
        providesTags: (_result, _err, id) => [{ type: REFINEMENT_TAG, id }],
        // A poll that left before an answer landed can come back after it: it is ignored, so the answered
        // suggestion doesn't come back. Leaving the cached session as it is keeps the newer one.
        merge: (shown, fetched) => (isOlderSessionReply(fetched, shown) ? undefined : fetched),
      }),

      acceptPending: build.mutation<RefinementSession, RefinementAnswerArgs>({
        query: ({ id, ...seen }) => ({
          url: `/resume-refinement/sessions/${id}/accept`,
          method: "POST",
          timeout: MODEL_REQUEST_TIMEOUT_MS,
          data: seen,
        }),
        async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
          await keepReturnedSession(queryFulfilled, (session) =>
            dispatch(resumeRefinementApi.util.upsertQueryData("getRefinementSession", session.id, session)),
          );
        },
        invalidatesTags: (result, _err, { id }) => reloadOnFailure(result, id),
      }),

      acceptFlagged: build.mutation<RefinementSession, RefinementAnswerArgs>({
        query: ({ id, ...seen }) => ({
          url: `/resume-refinement/sessions/${id}/accept-flagged`,
          method: "POST",
          timeout: MODEL_REQUEST_TIMEOUT_MS,
          data: seen,
        }),
        async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
          await keepReturnedSession(queryFulfilled, (session) =>
            dispatch(resumeRefinementApi.util.upsertQueryData("getRefinementSession", session.id, session)),
          );
        },
        invalidatesTags: (result, _err, { id }) => reloadOnFailure(result, id),
      }),

      supplyCustomRewrite: build.mutation<RefinementSession, CustomRewriteArgs>({
        query: ({ id, ...body }) => ({
          url: `/resume-refinement/sessions/${id}/custom`,
          method: "POST",
          timeout: MODEL_REQUEST_TIMEOUT_MS,
          data: body,
        }),
        async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
          await keepReturnedSession(queryFulfilled, (session) =>
            dispatch(resumeRefinementApi.util.upsertQueryData("getRefinementSession", session.id, session)),
          );
        },
        invalidatesTags: (result, _err, { id }) => reloadOnFailure(result, id),
      }),

      requestAlternative: build.mutation<RefinementSession, AlternativeRequestArgs>({
        query: ({ id, hint, ...seen }) => ({
          url: `/resume-refinement/sessions/${id}/alternative`,
          method: "POST",
          timeout: MODEL_REQUEST_TIMEOUT_MS,
          data: { hint: hint ?? null, ...seen },
        }),
        async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
          await keepReturnedSession(queryFulfilled, (session) =>
            dispatch(resumeRefinementApi.util.upsertQueryData("getRefinementSession", session.id, session)),
          );
        },
        invalidatesTags: (result, _err, { id }) => reloadOnFailure(result, id),
      }),

      skipTarget: build.mutation<RefinementSession, RefinementAnswerArgs>({
        query: ({ id, ...seen }) => ({
          url: `/resume-refinement/sessions/${id}/skip`,
          method: "POST",
          timeout: MODEL_REQUEST_TIMEOUT_MS,
          data: seen,
        }),
        async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
          await keepReturnedSession(queryFulfilled, (session) =>
            dispatch(resumeRefinementApi.util.upsertQueryData("getRefinementSession", session.id, session)),
          );
        },
        invalidatesTags: (result, _err, { id }) => reloadOnFailure(result, id),
      }),

      navigateRefinement: build.mutation<
        RefinementSession,
        { id: string; direction: NavDirection }
      >({
        query: ({ id, direction }) => ({
          url: `/resume-refinement/sessions/${id}/navigate`,
          method: "POST",
          timeout: MODEL_REQUEST_TIMEOUT_MS,
          data: { direction },
        }),
        async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
          await keepReturnedSession(queryFulfilled, (session) =>
            dispatch(resumeRefinementApi.util.upsertQueryData("getRefinementSession", session.id, session)),
          );
        },
        invalidatesTags: (result, _err, { id }) => reloadOnFailure(result, id),
      }),

      createTargetFromLine: build.mutation<
        RefinementSession,
        { id: string; current_text: string; section: string }
      >({
        query: ({ id, current_text, section }) => ({
          url: `/resume-refinement/sessions/${id}/target-from-line`,
          method: "POST",
          timeout: MODEL_REQUEST_TIMEOUT_MS,
          data: { current_text, section },
        }),
        async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
          await keepReturnedSession(queryFulfilled, (session) =>
            dispatch(resumeRefinementApi.util.upsertQueryData("getRefinementSession", session.id, session)),
          );
        },
        invalidatesTags: (result, _err, { id }) => reloadOnFailure(result, id),
      }),

      retryPreparation: build.mutation<RefinementSession, string>({
        query: (id) => ({
          url: `/resume-refinement/sessions/${id}/retry-preparation`,
          method: "POST",
          data: {},
        }),
        async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
          await keepReturnedSession(queryFulfilled, (session) =>
            dispatch(resumeRefinementApi.util.upsertQueryData("getRefinementSession", session.id, session)),
          );
        },
        invalidatesTags: (result, _err, id) => reloadOnFailure(result, id),
      }),

      completeRefinementSession: build.mutation<RefinementSession, string>({
        query: (id) => ({
          url: `/resume-refinement/sessions/${id}/complete`,
          method: "POST",
          data: {},
        }),
        async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
          await keepReturnedSession(queryFulfilled, (session) =>
            dispatch(resumeRefinementApi.util.upsertQueryData("getRefinementSession", session.id, session)),
          );
        },
        invalidatesTags: (result, _err, id) => reloadOnFailure(result, id),
      }),
    }),
  });

export const {
  useStartRefinementSessionMutation,
  useGetRefinementSessionQuery,
  useAcceptPendingMutation,
  useAcceptFlaggedMutation,
  useSupplyCustomRewriteMutation,
  useRequestAlternativeMutation,
  useSkipTargetMutation,
  useNavigateRefinementMutation,
  useCreateTargetFromLineMutation,
  useRetryPreparationMutation,
  useCompleteRefinementSessionMutation,
} = resumeRefinementApi;
