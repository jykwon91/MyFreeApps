import type { DashboardLayout } from "../types/DashboardLayout";

/** Copy for the Dashboard tab: the board of applications by stage. */
export const DASHBOARD_MESSAGES = {
  loading: "Loading your board",
  couldntLoad: "I couldn't load your board.",
  tryAgainOffer: "Want me to try again?",
  tryAgain: "Try again",
  noneHeading: "Your hunt starts here",
  noneBody: "Paste a job description on the Analyze page to see how it ranks for you, then add it to your applications.",
  analyze: "Analyze a job",
  summaryTitle: "Pipeline",
  onYourBoard: "on your board",
  application: "application",
  applications: "applications",
  showsStage: "Scrolls to this stage",
  noneInLane: "None",
  showsLane: "Shows or hides this lane in every stage",
  showsClosed: "Shows or hides closed applications",
  opensApplication: "Opens this application",
  move: "Move",
  moveHint: "Moves it to another stage",
  daysInStage: "days in stage",
  dayInStage: "day in stage",
} as const;

/** Size of a company's logo on a card. */
export const COMPANY_LOGO_SIZE = 32;

/** The summary's stage tiles sit two to a row, so each takes just under half the width. */
export const STAGE_TILE_BASIS = "47%";

/** Where the phone keeps which lanes and stages the person folded, so the board opens the way they left it. */
export const DASHBOARD_FOLDS_KEY = "mjh_dashboard_folds";

/** The board before anything is folded or opened: every lane open and Closed folded, as on the website. */
export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = { collapsedLanes: new Set(), isClosedOpen: false };

/** How long to let the list draw the rows near a stage before scrolling to it again. */
export const STAGE_SCROLL_RETRY_MS = 100;

/** How many times to try again to scroll to a stage the list hadn't drawn yet. */
export const STAGE_SCROLL_RETRY_LIMIT = 3;
