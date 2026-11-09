export const LEASE_DOCUMENT_MESSAGES = {
  pickTitle: "Which documents should I add?",
  pickBody: "Pick templates for an extension, addendum or disclosure. One already on this lease is made again.",
  onThisLease: "Already on this lease. Picking it makes it again.",
  loadingTemplates: "Loading your templates",
  loadingFields: "Loading what I need for these documents",
  couldntLoadTemplates: "I couldn't load your templates. Want me to try again?",
  couldntLoadFields: "I couldn't load what I need for these documents. Want me to try again?",
  noTemplatesHeading: "I don't have any templates yet.",
  noTemplatesBody: "Upload one on the website, and I can use it here.",
  openWebsite: "Open on the website",
  goneHeading: "I can't find that lease or one of those templates.",
  goneBody: "They may have been deleted.",
  checkConnection: "Check your connection and try again.",
  tryAgain: "Try again",
  goBack: "Go back",
  fillTitle: "What goes in these documents?",
  fillBody: "I filled in what I could. Change anything that's wrong and fill in the rest.",
  nothingToFill: "There's nothing for you to fill in. I'll make the documents as they are.",
  required: "I need this one.",
  notANumber: "That isn't a number I can read. Use digits, like 1500 or 1,500.50.",
  needMoreAnswers: "I need a few more answers.",
  make: "Make the documents",
  making: "Making the documents…",
  discardTitle: "Discard these documents?",
  discardBody: "I won't make them, and I won't keep what you've changed here.",
  unsure: "I didn't hear back, so I'm not sure the documents were made. Check the lease's files before trying again.",
  refused: "That didn't go through, so I didn't make the documents. Want to try again?",
  gone: "I can't find that lease or one of those templates anymore.",
  viewOnly: "You have view-only access, so I can't make documents.",
} as const;

export function continueWithDocuments(count: number): string {
  return `Continue with ${count} ${count === 1 ? "template" : "templates"}`;
}

export function documentsMade(count: number, again: boolean): string {
  const noun = count === 1 ? "document" : `${count} documents`;
  return again ? `I made the ${noun} again.` : `I added the ${noun}.`;
}

export function prefillCaption(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}
