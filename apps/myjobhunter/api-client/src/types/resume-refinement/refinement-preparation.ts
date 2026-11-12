import type { SeverityCount } from "./severity-count";

/**
 * The background preparation's stage: `critiquing` while the number of targets is unknown,
 * `drafting` while suggestions fill in behind the poll, `failed` when it stopped.
 */
export type RefinementPreparation =
  | { stage: "failed" }
  | { stage: "critiquing" }
  | { stage: "drafting"; total: number; ready: number; severities: SeverityCount[] };
