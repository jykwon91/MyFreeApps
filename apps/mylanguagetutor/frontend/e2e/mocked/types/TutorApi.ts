import type { SentRequest } from "@platform/ui/test-support/types/SentRequest";
import type { TurnRequest } from "./TurnRequest";

/** What the page asked of the stubbed tutor API, and the spec's handle on it. */
export interface TutorApi {
  /** Every PUT / POST except turns, in order. */
  writes: SentRequest[];
  /** The path (and query) of every read. */
  reads: string[];
  /** Every turn sent. */
  turnRequests: TurnRequest[];
  /** Lets an endpoint named in failWith answer normally again. */
  stopFailing: (key: string) => void;
}
