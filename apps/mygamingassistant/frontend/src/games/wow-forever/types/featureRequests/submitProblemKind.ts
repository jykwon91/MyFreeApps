import type { SUBMIT_PROBLEM } from "@/games/wow-forever/data/featureRequests/suggestCopy";

/** Why a submit didn't produce a verdict. */
export type SubmitProblemKind = (typeof SUBMIT_PROBLEM)[keyof typeof SUBMIT_PROBLEM];
