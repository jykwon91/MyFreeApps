import { VERDICT_TONES } from "../constants/verdictTones";
import type { StatusTone } from "../types/status-tone";
import { isJobAnalysisVerdict } from "./isJobAnalysisVerdict";

/** A card's verdict tone; info when there is none or it was added on the backend after this build. */
export function toneForVerdict(verdict: string | null): StatusTone {
  return verdict && isJobAnalysisVerdict(verdict) ? VERDICT_TONES[verdict] : "info";
}
