import { baseApi } from "@platform/ui";
import api from "@/lib/api";
import { BOARD_PAGE_SIZE } from "@/games/wow-forever/data/featureRequests/featureRequestBoard";
import { SUBMIT_TIMEOUT_MS } from "@/games/wow-forever/data/featureRequests/suggestCopy";
import { featureRequestListQuery } from "@/games/wow-forever/lib/featureRequests/boardParams";
import { isMergedRedirect } from "@/games/wow-forever/lib/featureRequests/featureRequestGuards";
import type { FeatureRequestListArgs } from "@/games/wow-forever/types/featureRequests/featureRequestListArgs";
import type { FeatureRequestLookup } from "@/games/wow-forever/types/featureRequests/featureRequestLookup";
import type { FeatureRequestPage } from "@/games/wow-forever/types/featureRequests/featureRequestPage";
import type { PublicStory } from "@/games/wow-forever/types/featureRequests/publicStory";
import type { SubmitFeatureRequestBody } from "@/games/wow-forever/types/featureRequests/submitFeatureRequestBody";
import type { SubmitFeatureRequestResponse } from "@/games/wow-forever/types/featureRequests/submitFeatureRequestResponse";
import type { VoteArgs } from "@/games/wow-forever/types/featureRequests/voteArgs";
import type { VoteResponse } from "@/games/wow-forever/types/featureRequests/voteResponse";

const FEATURE_REQUESTS_URL = "/wow/feature-requests";
const TAG = "WowFeatureRequest";

const featureRequestsBaseApi = baseApi.enhanceEndpoints({ addTagTypes: [TAG] });

function storyUrl(storyId: string): string {
  return `${FEATURE_REQUESTS_URL}/${encodeURIComponent(storyId)}`;
}

/** A tap moves the count by one; the server's answer replaces the guess. */
function patchCount(story: PublicStory, voted: boolean, voteCount: number | null): void {
  story.vote_count = voteCount ?? Math.max(0, story.vote_count + (voted ? 1 : -1));
}

/** The board's vote count and "voted" mark for one story, in every loaded page. */
function patchStory(pages: FeatureRequestPage[], storyId: string, voted: boolean, voteCount: number | null): void {
  for (const page of pages) {
    const story = page.items.find((s) => s.id === storyId);
    if (story === undefined) continue;
    patchCount(story, voted, voteCount);
    const ids = new Set(page.voted_story_ids);
    if (voted) ids.add(storyId);
    else ids.delete(storyId);
    page.voted_story_ids = Array.from(ids);
  }
}

export const wowFeatureRequestsApi = featureRequestsBaseApi.injectEndpoints({
  endpoints: (build) => ({
    /** The public board, `BOARD_PAGE_SIZE` stories a page ("Show more" loads the next). */
    getFeatureRequests: build.infiniteQuery<FeatureRequestPage, FeatureRequestListArgs, number>({
      infiniteQueryOptions: {
        initialPageParam: 0,
        getNextPageParam: (lastPage) => lastPage.next_offset ?? undefined,
      },
      query: ({ queryArg, pageParam }) => ({
        url: `${FEATURE_REQUESTS_URL}?${featureRequestListQuery(queryArg, pageParam, BOARD_PAGE_SIZE)}`,
        method: "GET",
      }),
      providesTags: [TAG],
    }),
    /** One public story — for a `?r=` link to a story not in the loaded pages. */
    getFeatureRequest: build.query<FeatureRequestLookup, string>({
      query: (storyId) => ({ url: storyUrl(storyId), method: "GET" }),
      providesTags: (_result, _error, storyId) => [{ type: TAG, id: storyId }],
    }),
    /** "Me too" (POST) or taking it back (DELETE). Optimistic: the card changes at the tap, and rolls back on failure. */
    voteFeatureRequest: build.mutation<VoteResponse, VoteArgs>({
      query: ({ storyId, voted, clientId }) => ({
        url: `${storyUrl(storyId)}/vote`,
        method: voted ? "POST" : "DELETE",
        data: { client_id: clientId },
      }),
      async onQueryStarted({ storyId, voted, listArgs }, { dispatch, queryFulfilled }) {
        const patch = (nextVoted: boolean, voteCount: number | null) => [
          dispatch(
            wowFeatureRequestsApi.util.updateQueryData("getFeatureRequests", listArgs, (draft) => {
              patchStory(draft.pages, storyId, nextVoted, voteCount);
            }),
          ),
          // The card pinned above the board by a `?r=` link.
          dispatch(
            wowFeatureRequestsApi.util.updateQueryData("getFeatureRequest", storyId, (draft) => {
              if (!isMergedRedirect(draft)) patchCount(draft, nextVoted, voteCount);
            }),
          ),
        ];
        const optimistic = patch(voted, null);
        try {
          const { data } = await queryFulfilled;
          patch(data.voted, data.vote_count);
        } catch {
          for (const p of optimistic) p.undo();
        }
      },
    }),
  }),
});

export const { useGetFeatureRequestsInfiniteQuery, useGetFeatureRequestQuery, useVoteFeatureRequestMutation } =
  wowFeatureRequestsApi;

/**
 * Send an idea. Not an RTK mutation: the form needs the Retry-After header of a 429 and a real abort
 * (Cancel, the 30 s timeout), which the shared base query doesn't pass through. The Turnstile token is
 * single-use — callers get a fresh one for every call. Rejects with the axios error.
 */
export async function submitFeatureRequest(
  body: SubmitFeatureRequestBody,
  turnstileToken: string,
  signal: AbortSignal,
): Promise<SubmitFeatureRequestResponse> {
  const headers: Record<string, string> = turnstileToken === "" ? {} : { "X-Turnstile-Token": turnstileToken };
  const response = await api.post<SubmitFeatureRequestResponse>(FEATURE_REQUESTS_URL, body, {
    headers,
    signal,
    timeout: SUBMIT_TIMEOUT_MS,
  });
  return response.data;
}

/** After a submit counted a vote (duplicate verdict), the board's counts are stale. */
export const invalidateFeatureRequests = () => wowFeatureRequestsApi.util.invalidateTags([TAG]);
