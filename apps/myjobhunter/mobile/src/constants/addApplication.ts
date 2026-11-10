import type { RemoteType } from "@myjobhunter/api-client/types/application/remote-type";
import type { AddApplicationFormValues } from "@myjobhunter/api-client/types/application/add-application-form-values";
import type { AddApplicationSource } from "../types/AddApplicationSource";

/** Copy for adding an application: where it comes from, the review form, and the company picker. */
export const ADD_APPLICATION_MESSAGES = {
  screenTitle: "Add application",
  backTitle: "Applications",
  sourceLabel: "Where it comes from",
  linkLabel: "Job posting link",
  linkPlaceholder: "https://jobs.example.com/posting/abc",
  linkHint: "I'll read the posting and fill in what I can.",
  pasteLink: "Paste link and auto-fill",
  autoFill: "Auto-fill",
  readingLink: "Reading job posting…",
  textLabel: "Job description",
  textPlaceholder: "Paste the full job description here…",
  textHint: "For postings behind a sign-in, like LinkedIn. I'll fill in what I can.",
  autoFillFromText: "Auto-fill from text",
  readingText: "Reading description…",
  manualHint: "Choose the company, then fill in the rest yourself.",
  longRunning: "This is taking longer than usual…",
  couldntReadClipboard: "I couldn't read your clipboard. Paste the link into the field instead.",
  noLinkOnClipboard: "There's no link on your clipboard to paste.",
  notALink: "That doesn't look like a link. Make sure it starts with http:// or https://.",
  linkBlocked:
    "I couldn't read that link: it needs a sign-in. Sites like LinkedIn and Glassdoor block automated access. Paste the job description text here and I'll fill in what I can.",
  couldntAutoFill: "I couldn't fill it in.",
  couldntReadText: "I couldn't read that description. Try again, or type it in yourself.",
  reviewHeading: "Check it over before saving",
  fromLink: "From",
  companyLabel: "Company",
  chooseCompany: "Choose a company",
  companyTracked: "Already in your companies. Tap to change.",
  companyAdded: "Added to your companies. Tap to change.",
  companyChosen: "Tap to change.",
  companyAddFailed: "I couldn't add this company. I'll try again when you save, or tap to choose another.",
  companyNotFound: "I couldn't tell the company from the posting. Tap to choose or add one.",
  couldntAddCompany: "I couldn't add that company.",
  companyRequired: "Choose a company before saving.",
  roleLabel: "Role title",
  rolePlaceholder: "e.g. Senior Backend Engineer",
  locationLabel: "Location",
  locationPlaceholder: "e.g. SF, NYC, Remote-EU",
  remoteLabel: "Remote",
  remoteTitle: "Remote, hybrid or on site?",
  notesLabel: "Notes",
  notesPlaceholder: "Anything to remember about this role…",
  save: "Add application",
  saving: "Adding…",
  added: "Application added",
  couldntSave: "I couldn't add the application. Want to try again?",
  pickerTitle: "Choose a company",
  close: "Close",
  searchPlaceholder: "Search, or type a new company",
  searchLabel: "Search your companies by name or website",
  addCompany: "Add",
  addingCompany: "Adding company",
  noCompanies: "No companies yet. Type a name to add one.",
  noMatches: "None of your companies match.",
  loadingCompanies: "Loading your companies",
  couldntLoadCompanies: "I couldn't load your companies.",
  tryAgain: "Try again",
} as const;

export const ADD_APPLICATION_SOURCES: readonly { value: AddApplicationSource; label: string }[] = [
  { value: "url", label: "Link" },
  { value: "text", label: "Paste text" },
  { value: "manual", label: "Type it in" },
];

export const REMOTE_TYPE_OPTIONS: readonly { value: RemoteType; label: string }[] = [
  { value: "unknown", label: "Unknown" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "Onsite" },
];

export const EMPTY_ADD_APPLICATION_FORM: AddApplicationFormValues = {
  role_title: "",
  location: "",
  remote_type: "unknown",
  notes: "",
};

/** Placeholder rows while the company list loads. */
export const COMPANY_PICKER_SKELETON_ROWS = ["a", "b", "c", "d", "e"] as const;

/** Tall enough for a pasted job description or a few lines of notes. */
export const MULTILINE_MIN_HEIGHT = 120;
