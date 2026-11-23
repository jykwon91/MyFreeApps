import { replayRate } from "@mylanguagetutor/api-client/utils/replayRate";
import type { PracticeSession } from "@mylanguagetutor/api-client/types/session/practice-session";
import type { PracticeSessionConfig } from "@mylanguagetutor/api-client/types/session/practice-session-config";

/**
 * A test's stand-in for ``usePracticeSession``: the conversation state the test sets, with ``busy`` and
 * ``replay`` worked out as the real hook does, from that state and the speech the screen hands it.
 */
export function fakePracticeSession(
  state: Omit<PracticeSession, "busy" | "replay">,
  config: PracticeSessionConfig,
): PracticeSession {
  return {
    ...state,
    busy: state.requestPhase !== "idle",
    replay: (text, slow) => config.speakAll(text, replayRate(slow)),
  };
}
