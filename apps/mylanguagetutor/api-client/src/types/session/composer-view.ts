/**
 * What the bottom of the practice screen shows.
 * - ``blocked``: why the learner can't send now (daily limit, conversation ended...)
 * - ``denied``: the microphone was refused; how to allow it, or type instead
 * - ``privacy``: the notice read once before the first microphone use
 * - ``voice``: the microphone, with the live transcript
 * - ``text``: the typed answer
 */
export type ComposerView = "blocked" | "denied" | "privacy" | "voice" | "text";
