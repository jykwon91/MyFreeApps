import type { HiddenCharSegment } from "@/games/wow-forever/types/featureRequests/triage/hiddenCharSegment";

export interface RevealedText {
  segments: HiddenCharSegment[];
  hasHidden: boolean;
}
