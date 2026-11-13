/** A data export in build_export's shape: the learner, their profile, and one conversation with its turn. */
import { TEST_USER } from "@platform/ui/test-support/mockSession";
import { NOW } from "../constants/fixtureTimes";
import { LEARNER_GREETING, TUTOR_GREETING, TUTOR_GREETING_TRANSLATION } from "../constants/practiceText";
import type { AccountExport } from "../types/AccountExport";
import { GREETINGS } from "./catalogFixtures";
import { sessionIdAt, turnIdAt } from "./fixtureIds";
import { profileOf, sessionOf } from "./tutorFixtures";

const { language_code, level } = profileOf();

export const ACCOUNT_EXPORT: AccountExport = {
  exported_at: NOW,
  user: {
    id: TEST_USER.id,
    email: TEST_USER.email,
    display_name: TEST_USER.display_name,
    is_verified: TEST_USER.is_verified,
    totp_enabled: TEST_USER.totp_enabled,
  },
  tutor_profile: { language_code, level },
  tutor_sessions: [
    {
      ...sessionOf(sessionIdAt(1), { language_code, scenario_slug: GREETINGS.slug, level }),
      turn_count: 1,
      turns: [
        {
          id: turnIdAt(1),
          seq: 1,
          status: "complete",
          learner_text: LEARNER_GREETING,
          reply_text: TUTOR_GREETING,
          corrections: [],
          translation_text: TUTOR_GREETING_TRANSLATION,
          created_at: NOW,
        },
      ],
    },
  ],
};
