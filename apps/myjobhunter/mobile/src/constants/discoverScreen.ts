import { DISCOVER_EMPTY_STATES, DISCOVER_NO_SAVED_SEARCHES_COPY, DISCOVER_SHOW_ALL_SOURCES_LABEL } from "@myjobhunter/api-client/constants/discoverEmptyStates";
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
  noSavedSearchesHeading: DISCOVER_NO_SAVED_SEARCHES_COPY.heading,
  noSavedSearchesBody: DISCOVER_NO_SAVED_SEARCHES_COPY.body,
  showAllSources: DISCOVER_SHOW_ALL_SOURCES_LABEL,
  scoring: "Scoring your new postings",
  listSummary: (view: DiscoverView, count: number) => `${DISCOVER_VIEW_LABELS[view]}: ${count} posting${count === 1 ? "" : "s"}`,
} as const;

/** The Inbox, Saved and Dismissed tabs, in the website's order. */
export const DISCOVER_VIEW_SEGMENTS: readonly { value: DiscoverView; label: string }[] = DISCOVER_VIEWS.map((view) => ({
  value: view,
  label: DISCOVER_VIEW_LABELS[view],
}));

function viewCopy(view: DiscoverView, couldntLoad: string): DiscoverViewCopy {
  const { empty, emptyFiltered } = DISCOVER_EMPTY_STATES[view];
  return {
    couldntLoad,
    emptyHeading: empty.heading,
    emptyBody: empty.body,
    emptyFilteredHeading: emptyFiltered.heading,
    emptyFilteredBody: emptyFiltered.body,
  };
}

/** What each view says when it couldn't load, or has nothing to show with every saved search or one chosen. */
export const DISCOVER_VIEW_COPY: Readonly<Record<DiscoverView, DiscoverViewCopy>> = {
  inbox: viewCopy("inbox", DISCOVER_SCREEN_MESSAGES.couldntLoadInbox),
  saved: viewCopy("saved", DISCOVER_SCREEN_MESSAGES.couldntLoadSaved),
  dismissed: viewCopy("dismissed", DISCOVER_SCREEN_MESSAGES.couldntLoadDismissed),
};

/** The source filter's choice for every saved search. No saved search's id is empty. */
export const ALL_SOURCES = "";

/** The subtitle's line, fixed so its skeleton stands exactly as tall. */
export const DISCOVER_SUBTITLE_LINE_HEIGHT = 20;

/** One per card the skeleton shows while postings load. */
export const DISCOVERED_JOB_SKELETON_CARDS = ["a", "b", "c"] as const;
