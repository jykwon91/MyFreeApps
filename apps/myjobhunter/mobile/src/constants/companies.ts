/** Copy for the Companies list and its add-company sheet. The empty state words it as the website does. */
export const COMPANY_MESSAGES = {
  screenTitle: "Companies",
  backTitle: "More",
  loadingList: "Loading your companies",
  couldntLoadList: "I couldn't load your companies.",
  tryAgainOffer: "Want me to try again?",
  tryAgain: "Try again",
  noneHeading: "No companies here yet",
  noneBody: "I'll add companies here as you log applications — no need to add them separately.",
  addFromEmpty: "Add a company",
  opensCompany: "Opens this company",
  add: "Add company",
  sort: "Sort",
  sortTitle: "Sort companies by",
  addTitle: "Add company",
  nameLabel: "Name",
  namePlaceholder: "e.g. Acme Corp",
  domainLabel: "Domain",
  domainPlaceholder: "acme.com",
  domainHint: "Optional — must be unique across your companies if set.",
  industryLabel: "Industry",
  industryPlaceholder: "e.g. SaaS",
  hqLabel: "HQ location",
  hqPlaceholder: "e.g. SF, NYC",
  save: "Add company",
  saving: "Adding…",
  cancel: "Cancel",
  added: (name: string) => `Company “${name}” added`,
  couldntAdd: "I couldn't add the company. Want to try again?",
} as const;

/** One per row the skeleton shows while the list loads. */
export const COMPANY_SKELETON_ROWS = ["a", "b", "c", "d", "e", "f"] as const;
