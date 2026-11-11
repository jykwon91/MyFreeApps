import type { JobAnalysis } from "@myjobhunter/api-client/types/job-analysis/job-analysis";
import type { PendingAnalysis } from "@myjobhunter/api-client/types/job-analysis/pending-analysis";
import { verdictBannerLabel } from "@myjobhunter/api-client/utils/verdictBannerLabel";
import { useEffect, useRef } from "react";
import { AccessibilityInfo } from "react-native";
import { ANALYZE_MESSAGES as MESSAGES } from "../../constants/analyze";

/**
 * Reads the verdict out when a result arrives while the screen waits for it. A result already there
 * when the screen opens, such as one saved earlier, is only read as the card, not announced.
 */
export function useAnnounceNewVerdict(pending: PendingAnalysis | null, result: JobAnalysis | null): void {
  const waiting = useRef(pending !== null);
  useEffect(() => {
    if (pending) {
      waiting.current = true;
      return;
    }
    if (waiting.current && result) {
      AccessibilityInfo.announceForAccessibility(`${MESSAGES.verdictHeading}: ${verdictBannerLabel(result.verdict)}`);
    }
    waiting.current = false;
  }, [pending, result]);
}
