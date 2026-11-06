import type { SUBMIT_STAGE } from "@/games/wow-forever/data/featureRequests/suggestCopy";

/** Which status line shows while an idea is being read. */
export type SubmitStage = (typeof SUBMIT_STAGE)[keyof typeof SUBMIT_STAGE];
