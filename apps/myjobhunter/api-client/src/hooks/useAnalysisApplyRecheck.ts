import { useState } from "react";
import { useLazyGetJobAnalysisQuery } from "../store/jobAnalysisApi";
import type { LostCreateCheck } from "../types/write/lost-create-check";
import type { LostCreateRecheck } from "../types/write/lost-create-recheck";
import { recheckLostCreate } from "../utils/recheckLostCreate";

/**
 * Whether adding an analysis to applications went through after its answer was lost: the analysis, read again, names the
 * application it made. Takes the analysis id and resolves to that application's id.
 */
export function useAnalysisApplyRecheck(): LostCreateRecheck<string, string> {
  const [getAnalysis] = useLazyGetJobAnalysisQuery();
  const [isChecking, setIsChecking] = useState(false);

  async function recheck(analysisId: string): Promise<LostCreateCheck<string>> {
    setIsChecking(true);
    try {
      return await recheckLostCreate(async () => (await getAnalysis(analysisId, false).unwrap()).applied_application_id ?? undefined);
    } finally {
      setIsChecking(false);
    }
  }

  return { recheck, isChecking };
}
