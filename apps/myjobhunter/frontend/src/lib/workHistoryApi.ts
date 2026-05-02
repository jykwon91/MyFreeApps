import { baseApi } from "@platform/ui";
import type { WorkHistory } from "@/types/work-history/work-history";
import type { WorkHistoryListResponse } from "@/types/work-history/work-history-list-response";
import type { WorkHistoryCreateRequest } from "@/types/work-history/work-history-create-request";
import type { WorkHistoryUpdateRequest } from "@/types/work-history/work-history-update-request";

const WORK_HISTORY_TAG = "WorkHistory";

const workHistoryApi = baseApi
  .enhanceEndpoints({ addTagTypes: [WORK_HISTORY_TAG] })
  .injectEndpoints({
    endpoints: (build) => ({
      listWorkHistory: build.query<WorkHistoryListResponse, void>({
        query: () => ({ url: "/work-history", method: "GET" }),
        providesTags: (result) =>
          result
            ? [
                ...result.items.map(({ id }) => ({ type: WORK_HISTORY_TAG, id }) as const),
                { type: WORK_HISTORY_TAG, id: "LIST" } as const,
              ]
            : [{ type: WORK_HISTORY_TAG, id: "LIST" } as const],
      }),

      createWorkHistory: build.mutation<WorkHistory, WorkHistoryCreateRequest>({
        query: (body) => ({ url: "/work-history", method: "POST", data: body }),
        invalidatesTags: [{ type: WORK_HISTORY_TAG, id: "LIST" }],
      }),

      updateWorkHistory: build.mutation<
        WorkHistory,
        { id: string; patch: WorkHistoryUpdateRequest }
      >({
        query: ({ id, patch }) => ({
          url: `/work-history/${id}`,
          method: "PATCH",
          data: patch,
        }),
        invalidatesTags: (_result, _err, { id }) => [
          { type: WORK_HISTORY_TAG, id },
          { type: WORK_HISTORY_TAG, id: "LIST" },
        ],
      }),

      deleteWorkHistory: build.mutation<void, string>({
        query: (id) => ({ url: `/work-history/${id}`, method: "DELETE" }),
        invalidatesTags: (_result, _err, id) => [
          { type: WORK_HISTORY_TAG, id },
          { type: WORK_HISTORY_TAG, id: "LIST" },
        ],
      }),
    }),
  });

export const {
  useListWorkHistoryQuery,
  useCreateWorkHistoryMutation,
  useUpdateWorkHistoryMutation,
  useDeleteWorkHistoryMutation,
} = workHistoryApi;
