/**
 * The triage API (`/api/wow/feature-requests/triage/*`, operator only) as endpoints on the app's
 * `baseApi`, so it shares the signed-in session: signing out resets `baseApi` and drops every cached
 * triage row with it. Requests go through `triageRequest` (shared axios, no-store, keepalive writes,
 * Retry-After kept for the undo queue); PATCH and merge send the story's `updated_at` as `If-Match`.
 * Private rows are not kept once the screen unmounts (`keepUnusedDataFor: 0`).
 */
import { baseApi } from "@platform/ui";
import type { RootState } from "@/lib/store";
import { triageRequest } from "@/games/wow-forever/lib/featureRequests/triage/triageRequest";
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

async function run<T>(args: TriageRequestArgs) {
  const result = await triageRequest<T>(args);
  return result.ok ? { data: result.data } : { error: result.error };
}

function storyPath(storyId: string): string {
  return `/stories/${encodeURIComponent(storyId)}`;
}

function needsRefresh(error: unknown): boolean {
  const status = (error as { error?: { status?: unknown } } | null)?.error?.status;
  return typeof status === "number" && REFRESH_ON.has(status);
}

export const triageApi = baseApi.enhanceEndpoints({ addTagTypes: [INBOX_TAG, STORIES_TAG] }).injectEndpoints({
  endpoints: (build) => ({
    getTriageInbox: build.query<TriageInbox, void>({
      queryFn: () => run<TriageInbox>({ path: "/inbox", method: "GET" }),
      providesTags: [INBOX_TAG],
      keepUnusedDataFor: 0,
    }),
    getTriageStories: build.query<TriageStoryList, void>({
      queryFn: () => run<TriageStoryList>({ path: "/stories", method: "GET" }),
      providesTags: [STORIES_TAG],
      keepUnusedDataFor: 0,
    }),
    patchTriageStory: build.mutation<TriageStory, TriagePatchArgs>({
      queryFn: ({ story, patch }) =>
        run<TriageStory>({ path: storyPath(story.id), method: "PATCH", body: patch, ifMatch: story.updated_at }),
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
      queryFn: ({ story, intoStoryId }) =>
        run<TriageMergeResult>({
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
      queryFn: (submissionIds) =>
        run<TriageMarkTriagedResult>({
          path: "/submissions/mark-triaged",
          method: "POST",
          body: { submission_ids: submissionIds },
        }),
      invalidatesTags: [INBOX_TAG],
    }),
  }),
});

export const { useGetTriageInboxQuery, useGetTriageStoriesQuery } = triageApi;

/** The app store's `api` slice IS this API's slice (one reducer); RTK only types it per tag set. */
type TriageApiState = Parameters<ReturnType<typeof triageApi.endpoints.getTriageInbox.select>>[0];

/** The cached inbox and story list (undefined when not loaded) — the freshest `updated_at` for If-Match. */
export function selectCachedTriage(state: RootState): { inbox: TriageInbox | undefined; stories: TriageStoryList | undefined } {
  const triageState = state as TriageApiState;
  return {
    inbox: triageApi.endpoints.getTriageInbox.select()(triageState).data,
    stories: triageApi.endpoints.getTriageStories.select()(triageState).data,
  };
}
