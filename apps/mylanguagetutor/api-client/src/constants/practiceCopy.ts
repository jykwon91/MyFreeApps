/** What the practice conversation says, on the website and the phone. */
export const PRACTICE_COPY = {
  goalsLabel: "Goals for this conversation",
  /** After a goal, for screen readers. */
  goalDone: "(done)",
  goalNotYet: "(not yet)",
  tutorThinking: "The tutor is thinking",
  replyCutOff: "The reply was cut off.",
  /** A whole reply whose stream ended before its corrections: nothing to resend. */
  correctionsMissing: "Suggestions for this reply didn't load.",
  /**
   * Under a reply: play it again at the normal pace, or slower. The button's name is its visible word, so
   * voice control can say it; the hint is what screen readers add.
   */
  replay: "Replay",
  replayHint: "Plays the reply again",
  replaySlow: "Slow",
  replaySlowHint: "Plays the reply again, slowly",
  /** The hint on both replay buttons while the microphone is open: the tutor would be heard as the answer. */
  replayUnavailableHint: "Unavailable while the microphone is listening",
  showTranslation: "Show translation",
  hideTranslation: "Hide translation",
  suggestionsLabel: "Suggestions",
  /** Hedged, because speech recognition may have misheard: "It looked like you said "x" — natural Spanish: "y"". */
  correctionSaid: "It looked like you said",
  correctionNatural: "— natural",
  tryIt: "Try it",
  skip: "Skip",
  scenarioComplete: "Scenario complete",
  scenarioCompleteBody: "You covered everything this conversation was about. Nice work.",
  nextScenario: "Next scenario",
  keepTalking: "Keep talking",
  tryAgain: "Try again",
  dismiss: "Dismiss",
  pickScenario: "Pick a scenario",
  /** The typed answer's label where speech can't be recognised, so it isn't mistaken for speaking practice. */
  typingOnlyLabel: "Typing practice (not speaking)",
  typeYourAnswer: "Type your answer",
  send: "Send",
  sending: "Sending",
  scenarioNotFound: "Scenario not found",
  scenarioNotFoundBody: "That scenario isn't available. Pick one from the list to start practicing.",
  seeScenarios: "See scenarios",
} as const;
