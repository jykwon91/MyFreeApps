/** Copy for a company's AI research section. */
export const COMPANY_RESEARCH_MESSAGES = {
  heading: "AI research",
  loading: "Loading the research",
  noneBody: "No research has been run yet. I can fetch reviews, compensation signals and culture notes from the web.",
  run: "Run research",
  running: "Researching…",
  runningNote: (name: string) => `Researching ${name}. This can take up to half a minute; I'll say when it's ready.`,
  rerun: "Run research again",
  ready: "The research is ready.",
  couldntRun: "I couldn't run the research. Want to try again?",
  failedBody: "The research didn't finish.",
  notConfigured: "Research isn't set up on the server, so it can't run. Trying again won't help until it is.",
  tryAgain: "Try again",
  couldntLoad: "I couldn't load the research.",
  gone: "This company has been deleted.",
  lastRun: (date: string) => `Last run ${date}`,
  whatTheyDo: "What they do",
  productsForYou: "Products that match your background",
  summary: "Summary",
  culture: "Culture signals",
  compensation: "Compensation signals",
  greenFlags: "Green flags",
  redFlags: "Red flags",
  sources: (count: number) => `${count} source${count === 1 ? "" : "s"}`,
  toggleSources: "Shows or hides the pages the research came from",
  opensSource: "Opens this source",
} as const;

/** Lines the research skeleton shows, as wide as a paragraph's lines. */
export const RESEARCH_SKELETON_LINES = ["100%", "90%", "95%", "70%"] as const;
