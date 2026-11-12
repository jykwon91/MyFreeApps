import type { FakeRoute } from "@platform/mobile/test-support/types/FakeRoute";
import { PROFILE, SCENARIOS, SPANISH, USAGE_LEFT } from "./tutorRecords";

/** What the server answers for a learner who has picked Spanish and a level. */
export const ONBOARDED_LEARNER_ROUTES: Record<string, FakeRoute> = {
  "GET /profile": () => ({ status: 200, data: PROFILE }),
  "GET /languages": () => ({ status: 200, data: [SPANISH] }),
  "GET /scenarios": () => ({ status: 200, data: SCENARIOS }),
  "GET /usage/today": () => ({ status: 200, data: USAGE_LEFT }),
};

/** The Practice tab's heading once that learner's scenarios have loaded. */
export const PRACTICE_HEADING = "Practice Spanish";
