/**
 * The "Suggest a feature" form's fixed values: limits, timings and what each state says.
 */
import type { SubmitProblemKind } from "@/games/wow-forever/types/featureRequests/submitProblemKind";
import type { SubmitStage } from "@/games/wow-forever/types/featureRequests/submitStage";

/** The server's limits on the idea text and the answer to a clarifying question. */
export const SUGGESTION_MIN_LENGTH = 10;
export const SUGGESTION_MAX_LENGTH = 1000;
/** The character counter shows from 80% of the limit. */
export const SUGGESTION_COUNTER_FROM = 800;
export const CLARIFY_ANSWER_MAX_LENGTH = 500;

/** Why a submit didn't come back with a story. */
export const SUBMIT_PROBLEM = {
  rejected: "rejected",
  rateLimited: "rate_limited",
  unavailable: "unavailable",
  network: "network",
  server: "server",
  tooShort: "too_short",
  humanCheck: "human_check",
} as const;

export const SUBMIT_PROBLEM_HEADING: Readonly<Record<SubmitProblemKind, string>> = {
  rejected: "Couldn't use that one",
  rate_limited: "That's enough for now",
  unavailable: "Suggestions are paused",
  network: "Couldn't reach the server",
  server: "Something went wrong",
  too_short: "A little more, please",
  human_check: "The human check didn't pass",
};

export const SUBMIT_PROBLEM_MESSAGE: Readonly<Record<SubmitProblemKind, string>> = {
  rejected:
    "I can only take ideas for this WoW companion — a new page, a missing tool or a fix to something here. Try rephrasing, or tell me what you were trying to do.",
  rate_limited: "You've sent a few ideas already.",
  unavailable: "Suggestions are paused right now. Your text is saved here — try again later.",
  network: "Couldn't reach the server. Check your connection and try again.",
  server: "Something went wrong on my side. Your text is saved here — try again in a moment.",
  too_short: "Add a few more words so I can understand it.",
  human_check: "Complete the quick human check again, then send.",
};

/** The notice's colour: a problem with the request is a warning, the service being off is info. */
export const SUBMIT_PROBLEM_VARIANT: Readonly<Record<SubmitProblemKind, "warning" | "error" | "info">> = {
  rejected: "warning",
  rate_limited: "warning",
  unavailable: "info",
  network: "error",
  server: "error",
  too_short: "warning",
  human_check: "warning",
};

/** The status lines while an idea is read. */
export const SUBMIT_STAGE = {
  reading: "reading",
  understanding: "understanding",
  checking: "checking",
  slow: "slow",
} as const;

export const SUBMIT_STAGE_LINE: Readonly<Record<SubmitStage, string>> = {
  reading: "Reading your idea…",
  understanding: "Working out what you mean…",
  checking: "Checking if someone already asked…",
  slow: "Taking a bit longer than usual…",
};

/** When each status line takes over, in ms since the click. Ascending. */
export const SUBMIT_STAGE_AT_MS: readonly { stage: SubmitStage; at: number }[] = [
  { stage: SUBMIT_STAGE.reading, at: 0 },
  { stage: SUBMIT_STAGE.understanding, at: 3_000 },
  { stage: SUBMIT_STAGE.checking, at: 7_000 },
  { stage: SUBMIT_STAGE.slow, at: 12_000 },
];

/** The Cancel link shows after this long. */
export const SUBMIT_CANCEL_AFTER_MS = 5_000;
/** A submit with no answer by then is given up on (shown as a network error, draft kept). */
export const SUBMIT_TIMEOUT_MS = 30_000;
/** How often the status line and the rate-limit countdown re-read the clock. */
export const SUBMIT_TICK_MS = 1_000;

export const SUGGEST_COPY = {
  title: "Suggest a feature",
  subtitle: "Tell me what's missing. I read every one.",
  label: "What would make this app better for you?",
  placeholder: "e.g. Show me the best place to level Tailoring from 150 to 225.",
  helper: "One idea per message works best.",
  privacy: "No account needed. I don't ask for your email.",
  submit: "Send my idea",
  submitting: "Reading your idea…",
  waitingForCheck: "Checking you're human…",
  boardHeading: "What players are asking for",
  newHeading: "Here's how I understood it",
  newReview: "It goes on the board once I've reviewed it.",
  newThanksToast: "Thanks — got your idea.",
  wrongHint: "Add what I got wrong",
  duplicateHeading: "Someone already asked for this. I added your vote.",
  /** The idea matched one this browser had already voted for. */
  duplicateNoVoteHeading: "Someone already asked for this.",
  clarifyHeading: "One quick question",
  voteFailed: "Couldn't save your vote. Try again.",
  voteRateLimited: "Slow down a little.",
  disabled: "Suggestions aren't switched on yet. You can still browse the ideas below and add your vote.",
  browserOnly:
    "Sending an idea works in the browser — Discord can't show the quick human check it needs. You can still add your vote to the ideas below.",
  boardError: "Couldn't load the board.",
  footer: "Missing something? Suggest a feature",
} as const;
