import type { SavingsCategory } from "@mybookkeeper/api-client/types/savings/savings-category";
import type { SavingsEffort } from "@mybookkeeper/api-client/types/savings/savings-effort";

export const SAVINGS_CATEGORY_LABELS: Record<SavingsCategory, string> = {
  credit_card: "Credit cards",
  bank_bonus: "Bank bonuses",
  subscription: "Subscriptions",
  phone_internet: "Phone & internet",
  insurance: "Insurance",
  mortgage: "Mortgage",
  utilities: "Utilities",
  property_tax: "Property tax",
  other: "Other",
};

export const SAVINGS_EFFORT_LABELS: Record<SavingsEffort, string> = {
  low: "Quick to do",
  medium: "Some effort",
  high: "A project",
};

export const SAVINGS_MESSAGES = {
  pageTitle: "Savings",
  pageSubtitle: "Ways to spend less, researched for you every day from your own spending.",
  loading: "Loading your savings ideas…",
  loadFailed: "Couldn't load your savings ideas.",

  offTitle: "Turn on daily savings research",
  offBody:
    "Once a day, a summary of your spending — totals by category, recurring charges by merchant name, your accounts' names and types, " +
    "your mortgage rate, insurance premiums, utility plans and your properties' city and ZIP — is sent to Anthropic's Claude, which searches " +
    "the web for card offers, bank bonuses, cheaper plans and other ways to save. No account numbers, " +
    "tenant names, street addresses or other transaction details are sent.",
  turnOn: "Turn on daily research",
  turningOn: "Turning on…",
  turnedOn: "Daily research is on. The first run is starting.",
  turnOff: "Turn off daily research",
  turningOff: "Turning off…",
  turnedOff: "Daily research is off.",
  toggleFailed: "Couldn't change daily research. Try again.",

  totalLabel: "Possible savings a year",
  lastResearched: "Last researched",
  nextResearch: "Next research",
  never: "Not yet",
  whileRunning: "After this run",
  researchNow: "Research now",
  researching: "Researching…",
  researchStarted: "Researching — this takes a few minutes. You can leave this page.",
  researchFailed: "Couldn't start research. Try again.",
  runsLeft: (left: number, limit: number) => `${left} of ${limit} research runs left today`,
  limitReached: (when: string) => `You've used today's research runs. Research now works again ${when}.`,
  runningBanner: "Researching your savings — this takes a few minutes. New ideas show up here when it's done.",
  lastRunFailed: "The last research run didn't finish. Your earlier ideas are still listed; try again later.",
  notConfigured: "Savings research isn't set up on this server yet.",

  emptyFirstRun: "No ideas yet. Your first research run is on its way, or press Research now.",
  emptyAll: "No open ideas right now. The next research run will look again.",
  emptyCategory: "No open ideas in this category.",
  filterLabel: "Filter ideas by category",
  allCategories: "All",

  showDetails: "Show details",
  hideDetails: "Hide details",
  whyItFits: "Why it fits you",
  steps: "How to do it",
  cardTerms: "Card terms",
  signUpBonus: "Sign-up bonus",
  minimumSpend: "Minimum spend",
  spendWithin: (months: number) => `within ${months} month${months === 1 ? "" : "s"}`,
  annualFee: "Annual fee",
  firstYearValue: "First-year value",
  creditImpact: "Credit impact",
  sources: "Sources",
  expires: (date: string) => `Ends ${date}`,
  lastChecked: (date: string) => `Checked ${date}`,
  openMortgages: "See your mortgages",
  openUtilityPlans: "Compare your utility plans",
  markDone: "Done",
  markingDone: "Saving…",
  dismiss: "Dismiss",
  dismissing: "Dismissing…",
  markedDone: "Marked done. Nice saving!",
  dismissed: "Dismissed. It won't come back.",
  statusFailed: "Couldn't update that idea. Try again.",

  disclaimer:
    "Ideas come from an AI reading public web pages and can be out of date or wrong. Check the offer's terms " +
    "on the source before acting. Opening new credit cards affects your credit; this isn't financial advice.",
} as const;
