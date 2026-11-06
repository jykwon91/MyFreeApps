import type { SUBMISSION_VERDICTS } from "@/games/wow-forever/data/featureRequests/featureRequestEnums";

/** What the refiner decided about one submission. */
export type SubmissionVerdict = (typeof SUBMISSION_VERDICTS)[number];
