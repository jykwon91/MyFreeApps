import type { DiscoverEmptyCopy } from "../types/discovery/discover-empty-copy";
import type { DiscoverView } from "../types/discovery/discover-view";
import type { DiscoverViewEmptyCopy } from "../types/discovery/discover-view-empty-copy";

/** The inbox's ask for a saved search, whatever the postings say. The same on the website and the phone. */
export const DISCOVER_NO_SAVED_SEARCHES_COPY: DiscoverEmptyCopy = {
  heading: "No saved searches yet",
  body:
    "Create a saved search and I'll pull tailored postings from Google Jobs (LinkedIn, Indeed, Glassdoor, " +
    "ZipRecruiter) every time you refresh it.",
};

/** The button on a filtered empty state that clears the saved-search filter. */
export const DISCOVER_SHOW_ALL_SOURCES_LABEL = "Show every saved search";

/** What each Discover view says when it's empty, with every saved search showing and with one chosen. */
export const DISCOVER_EMPTY_STATES: Readonly<Record<DiscoverView, DiscoverViewEmptyCopy>> = {
  inbox: {
    empty: {
      heading: "Inbox empty",
      body: "Refresh a saved search above to fetch the latest postings.",
    },
    emptyFiltered: {
      heading: "Inbox empty for this search",
      body: "Nothing from this saved search is waiting in your inbox. Refresh it to fetch the latest postings.",
    },
  },
  saved: {
    empty: {
      heading: "No saved jobs",
      body: "When you save a posting from the inbox it shows up here — hold it until you're ready to apply.",
    },
    emptyFiltered: {
      heading: "No saved jobs from this search",
      body: "You haven't saved a posting from this saved search yet.",
    },
  },
  dismissed: {
    empty: {
      heading: "No dismissed jobs",
      body: "Postings you dismiss show up here while they're still open, newest first, so you can restore one if you change your mind.",
    },
    emptyFiltered: {
      heading: "No dismissed jobs from this search",
      body: "You haven't dismissed a posting from this saved search.",
    },
  },
};
