/** What the language step and the scenario list say, on the website and the phone. */
export const CATALOG_COPY = {
  loadFailed: "Couldn't load your lessons.",
  retry: "Try again",
  /** Above a list that stays on screen after a refresh failed. */
  showingLastLoaded: "You're offline, or I can't reach the server. This is what I last loaded.",
  /** The scenario list's quiet notice when today's practice time can't be checked. */
  usageUnavailable: "Couldn't check today's practice time.",
  noLanguages: "No languages are available yet.",
  pickScenario: "Pick a scenario. Each one is a short conversation with a few goals to cover.",
  /** When the language has no scenarios yet: the empty list's heading and what it's waiting for. */
  noScenariosHeading: "No scenarios yet",
  noScenariosBody: "Scenarios for this language will show up here.",
  changeLevel: "Change level",
  /** Before the language name, as the scenario list's heading. */
  practicePrefix: "Practice",
  /** Before the level's label. */
  levelPrefix: "Level:",
} as const;
