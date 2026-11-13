import { DISCOVER_VIEW_LABELS, DISCOVER_VIEWS } from "@myjobhunter/api-client/constants/discoverViewLabels";
import type { DiscoverView } from "@myjobhunter/api-client/types/discovery/discover-view";
import type { DiscoverViewCopy } from "../types/DiscoverViewCopy";

/** Copy for the Discovery screen, worded as the website's for a phone that's tapped, not clicked. */
export const DISCOVER_SCREEN_MESSAGES = {
  screenTitle: "Discovery",
  backTitle: "More",
  subtitle: "New postings from LinkedIn, Indeed, Glassdoor, and ZipRecruiter via Google Jobs. Refresh a saved search to pull the latest.",
  newSavedSearch: "New saved search",
  viewsLabel: "Which postings to show",
  sourceFilter: "Saved search",
  allSources: "All",
  sourceSheetTitle: "Show postings from",
  loadingJobs: "Loading postings",
  couldntLoadInbox: "I couldn't load your inbox.",
  couldntLoadSaved: "I couldn't load your saved jobs.",
  couldntLoadDismissed: "I couldn't load your dismissed jobs.",
  tryAgainOffer: "Want me to try again?",
  tryAgain: "Try again",
  noSavedSearchesHeading: "No saved searches yet",
  noSavedSearchesBody:
    "Create a saved search and I'll pull tailored postings from Google Jobs (LinkedIn, Indeed, Glassdoor, ZipRecruiter) every time you tap Refresh.",
  inboxEmptyHeading: "Inbox empty",
  inboxEmptyBody: "Tap Refresh on a saved search above to fetch the latest postings.",
  savedEmptyHeading: "No saved jobs",
  savedEmptyBody: "When you save a posting from the inbox it shows up here — hold it until you're ready to apply.",
  dismissedEmptyHeading: "No dismissed jobs",
  dismissedEmptyBody: "Postings you dismiss show up here while they're still open, newest first, so you can restore one if you change your mind.",
  showAllSources: "Show every saved search",
  scoring: "Scoring your new postings",
  listSummary: (view: DiscoverView, count: number) => `${DISCOVER_VIEW_LABELS[view]}: ${count} posting${count === 1 ? "" : "s"}`,
} as const;

/** The Inbox, Saved and Dismissed tabs, in the website's order. */
export const DISCOVER_VIEW_SEGMENTS: readonly { value: DiscoverView; label: string }[] = DISCOVER_VIEWS.map((view) => ({
  value: view,
  label: DISCOVER_VIEW_LABELS[view],
}));

/** What each view says when it couldn't load, or has nothing to show. */
export const DISCOVER_VIEW_COPY: Readonly<Record<DiscoverView, DiscoverViewCopy>> = {
  inbox: { couldntLoad: DISCOVER_SCREEN_MESSAGES.couldntLoadInbox, emptyHeading: DISCOVER_SCREEN_MESSAGES.inboxEmptyHeading, emptyBody: DISCOVER_SCREEN_MESSAGES.inboxEmptyBody },
  saved: { couldntLoad: DISCOVER_SCREEN_MESSAGES.couldntLoadSaved, emptyHeading: DISCOVER_SCREEN_MESSAGES.savedEmptyHeading, emptyBody: DISCOVER_SCREEN_MESSAGES.savedEmptyBody },
  dismissed: {
    couldntLoad: DISCOVER_SCREEN_MESSAGES.couldntLoadDismissed,
    emptyHeading: DISCOVER_SCREEN_MESSAGES.dismissedEmptyHeading,
    emptyBody: DISCOVER_SCREEN_MESSAGES.dismissedEmptyBody,
  },
};

/** The source filter's choice for every saved search. No saved search's id is empty. */
export const ALL_SOURCES = "";

/** The subtitle's line, fixed so its skeleton stands exactly as tall. */
export const DISCOVER_SUBTITLE_LINE_HEIGHT = 20;

/** One per card the skeleton shows while postings load. */
export const DISCOVERED_JOB_SKELETON_CARDS = ["a", "b", "c"] as const;
