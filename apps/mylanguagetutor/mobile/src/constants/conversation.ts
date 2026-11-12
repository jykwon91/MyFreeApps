import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";

export const CONVERSATION_SCREEN_TITLE = "Practice";

/** What only the phone says: screen readers hear who said each message. */
export const CONVERSATION_MESSAGES = {
  loading: "Loading the conversation",
  learnerSaid: "You",
  tutorSaid: "Tutor",
} as const;

/** The website shows these as a heading and a line under it; a banner has one message. */
export const SCENARIO_COMPLETE_MESSAGE = `${PRACTICE_COPY.scenarioComplete}. ${PRACTICE_COPY.scenarioCompleteBody}`;

/** How far from the end, in points, still counts as reading the newest message. */
export const STICK_TO_BOTTOM_DISTANCE = 48;

/** The tutor-is-thinking dots, as on the website. */
export const TYPING_DOT_COUNT = 3;

/** Before a goal: ticked once the conversation covers it. */
export const GOAL_MARKS = { met: "✓", notYet: "○" } as const;

/** After a reply that was cut off, as on the website. */
export const PARTIAL_REPLY_MARK = " …";

/** How long the screen stays awake, after the last reply or keystroke, before it may sleep again. */
export const KEEP_AWAKE_IDLE_MS = 5 * 60 * 1000;

/**
 * After the app comes back, how long a turn whose whole reply has arrived may still wait for its
 * corrections. A connection that lived through the background delivers them within moments; one the
 * phone dropped while asleep never will, and Send would stay on "Sending".
 */
export const CORRECTIONS_GRACE_MS = 3000;
