/** Copy for a company page's applications list and the Delete button that depends on it. */
export const COMPANY_APPLICATIONS_MESSAGES = {
  heading: (companyName: string) => `Applications at ${companyName}`,
  loading: "Loading applications at this company",
  none: "No applications at this company yet.",
  couldntLoad: "Couldn't load this company's applications.",
  tryAgain: "Try again",
  retrying: "Trying again...",
  deleteBlocked: "This company has applications, so it can't be deleted.",
  deleteWaiting: "Checking this company's applications before it can be deleted.",
} as const;
