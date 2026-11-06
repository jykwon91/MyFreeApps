export interface ClarifyVerdictResponse {
  verdict: "needs_clarification";
  submission_id: string;
  question: string;
}
