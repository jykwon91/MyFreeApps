import { useCallback, useState } from "react";
import { showError } from "@platform/ui";
import { useVoteFeatureRequestMutation } from "@/games/wow-forever/api/wowFeatureRequestsApi";
import { SUGGEST_COPY } from "@/games/wow-forever/data/featureRequests/suggestCopy";
import type { FeatureBoardState } from "@/games/wow-forever/types/featureRequests/featureBoardState";
import type { MeTooState } from "@/games/wow-forever/types/featureRequests/meTooState";

const RATE_LIMITED_STATUS = 429;

function statusOf(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

/**
 * "Me too" on the board: the count and the pressed state change at the tap (the board's cache is patched
 * optimistically), roll back with a toast if the vote isn't saved, and tapping again takes the vote back.
 * A vote still being saved keeps its tapped state even if a background refetch lands first; a saved one
 * keeps the server's answer (the card pinned by a `?r=` link isn't in the board's "voted" list).
 */
export function useMeToo(board: FeatureBoardState, clientId: string): MeTooState {
  const [vote] = useVoteFeatureRequestMutation();
  const [pending, setPending] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [saved, setSaved] = useState<ReadonlyMap<string, boolean>>(new Map());
  const { serverVotedIds, listArgs } = board;

  const isVoted = useCallback(
    (storyId: string) => pending.get(storyId) ?? saved.get(storyId) ?? serverVotedIds.has(storyId),
    [pending, saved, serverVotedIds],
  );

  const toggle = useCallback(
    async (storyId: string) => {
      if (pending.has(storyId)) return;
      const voted = !isVoted(storyId);
      setPending((prev) => new Map(prev).set(storyId, voted));
      try {
        const result = await vote({ storyId, voted, clientId, listArgs }).unwrap();
        setSaved((prev) => new Map(prev).set(storyId, result.voted));
      } catch (err) {
        showError(statusOf(err) === RATE_LIMITED_STATUS ? SUGGEST_COPY.voteRateLimited : SUGGEST_COPY.voteFailed);
      } finally {
        setPending((prev) => {
          const next = new Map(prev);
          next.delete(storyId);
          return next;
        });
      }
    },
    [pending, isVoted, vote, clientId, listArgs],
  );

  return { isVoted, isPending: (storyId: string) => pending.has(storyId), toggle };
}
