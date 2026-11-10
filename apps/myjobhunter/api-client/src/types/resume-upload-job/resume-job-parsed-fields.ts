import type { ParseProvenance } from "./parse-provenance";

export interface ResumeJobParsedFields {
  summary: string | null;
  headline: string | null;
  work_history_count: number;
  education_count: number;
  skills_count: number;
  /** Parse-time hallucination-guard verdicts. Absent on jobs parsed
   *  before the guard shipped (2026-07-02); null means unchecked. */
  provenance?: ParseProvenance | null;
}
