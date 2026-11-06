import { useCallback, useEffect, useMemo, useState } from "react";
import { readMyIdeas, withApproved, withIdea, writeMyIdeas } from "@/games/wow-forever/lib/featureRequests/myIdeas";
import type { MyIdeasState } from "@/games/wow-forever/types/featureRequests/myIdeasState";
import type { PublicStory } from "@/games/wow-forever/types/featureRequests/publicStory";

/**
 * Ideas this browser sent that became stories. New stories are private until reviewed, so they're listed
 * ("Your ideas waiting for review") from localStorage; once the public board returns one, it was approved —
 * it leaves the list and its card says "You asked".
 */
export function useMyIdeas(boardStories: readonly PublicStory[]): MyIdeasState {
  const [ideas, setIdeas] = useState(readMyIdeas);
  const publicIds = useMemo(() => new Set(boardStories.map((s) => s.id)), [boardStories]);
  const known = useMemo(() => withApproved(ideas, publicIds), [ideas, publicIds]);

  useEffect(() => {
    if (known !== ideas) writeMyIdeas(known);
  }, [known, ideas]);

  const add = useCallback((id: string, title: string) => {
    setIdeas((prev) => {
      const next = withIdea(prev, id, title);
      writeMyIdeas(next);
      return next;
    });
  }, []);

  const pending = useMemo(() => known.filter((i) => !i.approved), [known]);
  const mine = useMemo(() => new Set(known.map((i) => i.id)), [known]);
  return { pending, mine, add };
}
