import { baseApi } from "@platform/ui";
import type { ScreeningAnswer } from "@/types/screening-answer/screening-answer";
import type { ScreeningAnswerListResponse } from "@/types/screening-answer/screening-answer-list-response";
import type { ScreeningAnswerCreateRequest } from "@/types/screening-answer/screening-answer-create-request";
import type { ScreeningAnswerUpdateRequest } from "@/types/screening-answer/screening-answer-update-request";

const SCREENING_ANSWERS_TAG = "ScreeningAnswers";

const screeningAnswersApi = baseApi
  .enhanceEndpoints({ addTagTypes: [SCREENING_ANSWERS_TAG] })
  .injectEndpoints({
    endpoints: (build) => ({
      listScreeningAnswers: build.query<ScreeningAnswerListResponse, void>({
        query: () => ({ url: "/screening-answers", method: "GET" }),
        providesTags: (result) =>
          result
            ? [
                ...result.items.map(({ id }) => ({ type: SCREENING_ANSWERS_TAG, id }) as const),
                { type: SCREENING_ANSWERS_TAG, id: "LIST" } as const,
              ]
            : [{ type: SCREENING_ANSWERS_TAG, id: "LIST" } as const],
      }),

      createScreeningAnswer: build.mutation<ScreeningAnswer, ScreeningAnswerCreateRequest>({
        query: (body) => ({ url: "/screening-answers", method: "POST", data: body }),
        invalidatesTags: [{ type: SCREENING_ANSWERS_TAG, id: "LIST" }],
      }),

      updateScreeningAnswer: build.mutation<
        ScreeningAnswer,
        { id: string; patch: ScreeningAnswerUpdateRequest }
      >({
        query: ({ id, patch }) => ({
          url: `/screening-answers/${id}`,
          method: "PATCH",
          data: patch,
        }),
        invalidatesTags: (_result, _err, { id }) => [
          { type: SCREENING_ANSWERS_TAG, id },
          { type: SCREENING_ANSWERS_TAG, id: "LIST" },
        ],
      }),

      deleteScreeningAnswer: build.mutation<void, string>({
        query: (id) => ({ url: `/screening-answers/${id}`, method: "DELETE" }),
        invalidatesTags: (_result, _err, id) => [
          { type: SCREENING_ANSWERS_TAG, id },
          { type: SCREENING_ANSWERS_TAG, id: "LIST" },
        ],
      }),
    }),
  });

export const {
  useListScreeningAnswersQuery,
  useCreateScreeningAnswerMutation,
  useUpdateScreeningAnswerMutation,
  useDeleteScreeningAnswerMutation,
} = screeningAnswersApi;
