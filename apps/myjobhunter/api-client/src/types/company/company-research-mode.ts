/**
 * What a company's research panel shows:
 *   'no-research' — none has been run yet (the GET's 404), or the GET hasn't answered
 *   'loading'     — a run is in flight
 *   'ready'       — a research record is loaded
 *   'failed'      — the run or the GET failed with anything but a 404
 */
export type CompanyResearchMode = "no-research" | "loading" | "ready" | "failed";
