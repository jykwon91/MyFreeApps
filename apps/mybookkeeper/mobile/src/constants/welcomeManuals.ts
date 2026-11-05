export const WELCOME_MANUAL_LIST_LIMIT = 100;
export const WELCOME_MANUAL_SKELETON_ROWS = ["a", "b", "c", "d"];

export const WELCOME_MANUAL_MESSAGES = {
  loadingList: "Loading your welcome manuals",
  loadingOne: "Loading this manual",
  couldntLoadList: "I couldn't load your manuals.",
  couldntLoadOne: "I couldn't load this manual.",
  cantFind: "I can't find that manual.",
  maybeDeleted: "It may have been deleted.",
  tryAgainOffer: "Want me to try again?",
  tryAgain: "Try again",
  back: "Back",
  noneHeading: "You don't have any welcome manuals yet.",
  noneBody: "Guides you make on the website show up here.",
  openWebsite: "Open on the website",
  manageOnWebsite: "I can't edit manuals here yet. Open the website to change them.",
  moreOnWebsite: `I'm showing the first ${WELCOME_MANUAL_LIST_LIMIT} manuals. The rest are on the website.`,
  noProperty: "No property tagged",
  noSectionsChip: "No sections yet",
  noSections: "No sections yet. Add some on the website.",
  accessCode: "Access code",
  share: "Share link and code",
  shareLinkOnly: "Share link",
  shareFailed: "I couldn't open sharing. Want to try again?",
  noShareLink: "This manual has no share link yet. Create one on the website.",
  whereToEat: "Where to eat",
  openMap: "Open map",
} as const;
