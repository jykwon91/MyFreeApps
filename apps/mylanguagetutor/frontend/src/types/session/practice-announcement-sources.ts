import type { SessionBlock } from "@mylanguagetutor/api-client/types/session/session-block";
import type { TurnFailure } from "@mylanguagetutor/api-client/types/session/turn-failure";

/** Everything on the practice screen that can ask the screen reader to say something. */
export interface PracticeAnnouncementSources {
  /** The phase change or the finished tutor reply, whichever is current. */
  spoken: string | undefined;
  failure: TurnFailure | null;
  block: SessionBlock | null;
  scenarioComplete: boolean;
}
