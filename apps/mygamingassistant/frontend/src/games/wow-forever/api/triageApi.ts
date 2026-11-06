/**
 * The triage API (`/api/wow/feature-requests/triage/*`) as RTK Query endpoints. Its own `createApi` with
 * its own store (`lib/featureRequests/triage/triageStore.ts`), so the private data lives only inside the
 * triage chunk and Lock can drop all of it with `resetApiState()`. Requests go through `triageRequest`
 * (key header, lock on 404/401, no-store); PATCH and merge send the story's `updated_at` as `If-Match`.
 */
import { createApi, type BaseQueryFn } from "@reduxjs/toolkit/query/react";
import { triageRequest } from "@/games/wow-forever/lib/featureRequests/triage/triageRequest";
import type { TriageApiError } from "@/games/wow-forever/types/featureRequests/triage/triageApiError";
import type { TriageInbox } from "@/games/wow-forever/types/featureRequests/triage/triageInbox";
import type { TriageMarkTriagedResult } from "@/games/wow-forever/types/featureRequests/triage/triageMarkTriagedResult";
import type { TriageMergeArgs } from "@/games/wow-forever/types/featureRequests/triage/triageMergeArgs";
import type { TriageMergeResult } from "@/games/wow-forever/types/featureRequests/triage/triageMergeResult";
import type { TriagePatchArgs } from "@/games/wow-forever/types/featureRequests/triage/triagePatchArgs";
import type { TriageRequestArgs } from "@/games/wow-forever/types/featureRequests/triage/triageRequestArgs";
import type { TriageStory } from "@/games/wow-forever/types/featureRequests/triage/triageStory";
import type { TriageStoryList } from "@/games/wow-forever/types/featureRequests/triage/triageStoryList";

const INBOX_TAG = "TriageInbox";
const STORIES_TAG = "TriageStories";
/** A stale If-Match or a conflicting merge: re-read both lists. */
const REFRESH_ON: ReadonlySet<number> = new Set([409, 412]);

const triageBaseQuery: BaseQueryFn<TriageRequestArgs, unknown, TriageApiError> = async (args) => {
  const result = await triageRequest<unknown>(args);
  return result.ok ? { data: result.data } : { error: result.error };
};

function storyPath(storyId: string): string {
  return `/stories/${encodeURIComponent(storyId)}`;
}

function needsRefresh(error: unknown): boolean {
  const status = (error as { error?: { status?: unknown } } | null)?.error?.status;
  return typeof status === "number" && REFRESH_ON.has(status);
}

export const triageApi = createApi({
  reducerPath: "wowTriageApi",
  baseQuery: triageBaseQuery,
  tagTypes: [INBOX_TAG, STORIES_TAG],
  endpoints: (build) => ({
    getTriageInbox: build.query<TriageInbox, void>({
      query: () => ({ path: "/inbox", method: "GET" }),
      providesTags: [INBOX_TAG],
    }),
    getTriageStories: build.query<TriageStoryList, void>({
      query: () => ({ path: "/stories", method: "GET" }),
      providesTags: [STORIES_TAG],
    }),
    patchTriageStory: build.mutation<TriageStory, TriagePatchArgs>({
      query: ({ story, patch }) => ({
        path: storyPath(story.id),
        method: "PATCH",
        body: patch,
        ifMatch: story.updated_at,
      }),
      async onQueryStarted(_args, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          // Swap the saved story in place — no refetch, so nothing on screen moves.
          dispatch(
            triageApi.util.updateQueryData("getTriageStories", undefined, (draft) => {
              const index = draft.items.findIndex((s) => s.id === data.id);
              if (index >= 0) draft.items[index] = data;
            }),
          );
          dispatch(
            triageApi.util.updateQueryData("getTriageInbox", undefined, (draft) => {
              for (const item of draft.items) if (item.story?.id === data.id) item.story = data;
            }),
          );
        } catch (error) {
          if (needsRefresh(error)) dispatch(triageApi.util.invalidateTags([INBOX_TAG, STORIES_TAG]));
        }
      },
    }),
    mergeTriageStory: build.mutation<TriageMergeResult, TriageMergeArgs>({
      query: ({ story, intoStoryId }) => ({
        path: `${storyPath(story.id)}/merge`,
        method: "POST",
        body: { into_story_id: intoStoryId },
        ifMatch: story.updated_at,
      }),
      async onQueryStarted(_args, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
        } catch (error) {
          if (!needsRefresh(error)) return;
        }
        dispatch(triageApi.util.invalidateTags([STORIES_TAG]));
      },
    }),
    markSubmissionsTriaged: build.mutation<TriageMarkTriagedResult, string[]>({
      query: (submissionIds) => ({
        path: "/submissions/mark-triaged",
        method: "POST",
        body: { submission_ids: submissionIds },
      }),
      invalidatesTags: [INBOX_TAG],
    }),
  }),
});

export const { useGetTriageInboxQuery, useGetTriageStoriesQuery } = triageApi;

/**
 * The unlock form's check: read the inbox with the typed key (no limit param exists — it is the
 * lightest triage read). Never stores the key and never locks; the caller keeps the key only on success.
 */
export function verifyTriageKey(candidateKey: string) {
  return triageRequest<TriageInbox>({ path: "/inbox", method: "GET", candidateKey });
}
