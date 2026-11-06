import { useCallback, useState } from "react";
import { aboutYouSummary } from "@/games/wow-forever/lib/featureRequests/featureRequestFormat";
import { readPlayerPrefill } from "@/games/wow-forever/lib/featureRequests/playerSettingsPrefill";
import type { AboutYouState } from "@/games/wow-forever/types/featureRequests/aboutYouState";
import type { SubmissionContext } from "@/games/wow-forever/types/featureRequests/submissionContext";

/**
 * The optional "about you" answers sent with an idea. Prefilled from the World Map's saved player (class,
 * level, faction) when there is one — the summary says so, and every answer can be changed or cleared.
 */
export function useAboutYou(): AboutYouState {
  const [prefill] = useState(readPlayerPrefill);
  const [context, setContext] = useState<SubmissionContext>(() => prefill?.context ?? {});
  const [fromSaved, setFromSaved] = useState(prefill !== null);

  const update = useCallback((patch: Partial<SubmissionContext>) => {
    setContext((prev) => ({ ...prev, ...patch }));
    setFromSaved(false);
  }, []);
  const clear = useCallback(() => {
    setContext({});
    setFromSaved(false);
  }, []);

  const summary = fromSaved && prefill !== null ? prefill.summary : aboutYouSummary(context);
  return { context, summary, update, clear };
}
