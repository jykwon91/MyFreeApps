import type { ClarifyVerdictResponse } from "@/games/wow-forever/types/featureRequests/clarifyVerdictResponse";
import type { DuplicateVerdictResponse } from "@/games/wow-forever/types/featureRequests/duplicateVerdictResponse";
import type { NewVerdictResponse } from "@/games/wow-forever/types/featureRequests/newVerdictResponse";
import type { RejectedVerdictResponse } from "@/games/wow-forever/types/featureRequests/rejectedVerdictResponse";

/** The submit answer, discriminated on `verdict`. */
export type SubmitFeatureRequestResponse =
  | NewVerdictResponse
  | DuplicateVerdictResponse
  | ClarifyVerdictResponse
  | RejectedVerdictResponse;
