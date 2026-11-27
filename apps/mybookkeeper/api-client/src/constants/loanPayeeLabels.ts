import type { LoanPayeeKind } from "../types/loan-payee/loan-payee-kind";

/** Fixed copy for counting a payee as a mortgage or a loan. */
export const LOAN_PAYEE_LABELS = {
  heading: "Mortgage or loan payment?",
  help: (payee: string) =>
    `If payments to ${payee} pay off a mortgage or a loan, I'll count every one of them — past and future — on Cash flow's "Mortgages & loans" line.`,
  tagMortgage: "Count as mortgage",
  tagLoan: "Count as loan",
  tagPending: "Saving…",
  tagged: (payee: string, kind: LoanPayeeKind) =>
    `Payments to ${payee} count as ${kind === "mortgage" ? "a mortgage" : "a loan"} payment.`,
  untag: "Stop counting it",
  untagPending: "Putting it back…",
  taggedToast: (payee: string) => `Got it — payments to ${payee} are on the "Mortgages & loans" line now.`,
  untaggedToast: (payee: string) => `Okay, payments to ${payee} count the way they did before.`,
  tagFailed: "I couldn't save that. Want to try again?",
  untagFailed: "I couldn't put that back. Want to try again?",
  loadFailed: "I couldn't check whether this is a mortgage or loan payment.",
} as const;
