import type { JobAnalysisSource } from "@myjobhunter/api-client/types/job-analysis/job-analysis-source";

/** Copy for the Analyze screen: the website's /analyze page, in the phone's voice. */
export const ANALYZE_MESSAGES = {
  screenTitle: "Analyze a job",
  heading: "Analyze a job",
  intro:
    "Paste a job description to see how it stacks up against your profile. I'll rank fit across skills, seniority, salary, location and work authorization, then you can decide whether to add it to your applications.",
  sourceLabel: "What to analyze",
  linkLabel: "Job posting link",
  linkPlaceholder: "https://jobs.example.com/posting/abc",
  linkHint: "I'll read the posting, then analyze it.",
  pasteLink: "Paste link and analyze",
  textLabel: "Job description",
  textPlaceholder: "Paste the full job description here…",
  textHint: "For postings behind a sign-in, like LinkedIn.",
  analyze: "Analyze this job",
  analyzing: "Analyzing…",
  notALink: "That doesn't look like a link. Make sure it starts with http:// or https://.",
  couldntReadClipboard: "I couldn't read your clipboard. Paste the link into the field instead.",
  noLinkOnClipboard: "There's no link on your clipboard to paste.",
  linkBlocked:
    "I couldn't read that link: it needs a sign-in. Sites like LinkedIn and Glassdoor block automated access. Paste the job description text here and I'll analyze it.",
  couldntAnalyze: "I couldn't analyze it.",
  readingLink: "Reading the posting and analyzing fit…",
  analyzingText: "Analyzing this role…",
  usualWait: "Usually takes 5–15 seconds.",
  longRunning: "This is taking longer than usual…",
  longWait: "Long postings can take 10–20 seconds to score.",
  cancel: "Cancel",
  cancelHint: "Stops waiting and goes back to what you entered",
  analyzedAgainst: "Analyzed against your profile",
  opensPosting: "Opens the posting",
  verdictHeading: "Overall verdict",
  dimensionsHeading: "How it fits",
  noDimensions: "No analysis available. Try analyzing again.",
  noRationale: "—",
  redFlags: "Red flags",
  greenFlags: "Green flags",
  bridge: "Add to applications to track interviews, contacts and documents for this role.",
  addToApplications: "Add to applications",
  adding: "Adding…",
  added: "Application added",
  couldntAdd: "I couldn't add it to your applications. Want to try again?",
  saved: "Saved to your applications.",
  viewApplications: "View applications",
  analyzeAnother: "Analyze another",
} as const;

/** The website's two ways in, link first as there. */
export const ANALYZE_SOURCES: readonly { value: JobAnalysisSource; label: string }[] = [
  { value: "url", label: "Link" },
  { value: "text", label: "Paste text" },
];
