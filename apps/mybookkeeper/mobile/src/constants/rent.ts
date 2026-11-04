export const RENT_CHARGES_SHOWN_AT_FIRST = 6;

export const RENT_MESSAGES = {
  section: "Rent",
  loading: "Loading the rent ledger",
  couldntLoad: "I couldn't load the rent ledger.",
  couldntLoadApplied: "I couldn't load how these applied to rent.",
  tryAgain: "Try again",
  notSetUp: "No rent set up yet.",
  setUpOnWebsiteNote: "Rent is set up on the website.",
  setUpOnWebsite: "Set up on the website",
  noneDue: "No rent is due right now. The schedule has ended or hasn't started.",
  fullyCovered: "This period is fully covered.",
  periodWaived: "This period was waived.",
  settled: "All paid up. Nothing outstanding.",
  chargesHeading: "Charges",
  chargeHint: "Shows the payments applied",
  nothingApplied: "Nothing applied to this charge yet.",
  waivedNothingApplied: "No payments applied. This charge was waived.",
  showFewer: "Show fewer",
  openPaymentHint: "Opens the transaction",
  heldAsCredit: "Held as credit",
} as const;

export function stillToCome(amount: string): string {
  return `${amount} still to come this period.`;
}

export function isOverdue(amount: string): string {
  return `${amount} is overdue.`;
}

export function owesInTotal(amount: string): string {
  return `Owes ${amount} in total`;
}

export function paidAhead(amount: string): string {
  return `Paid ahead by ${amount}`;
}

export function paidOfCharged(paid: string, charged: string): string {
  return `${paid} paid of ${charged} charged`;
}

export function amountOf(part: string, whole: string): string {
  return `${part} of ${whole}`;
}

export function partOfAPayment(part: string, total: string): string {
  return `${part} of a ${total} payment`;
}

export function waivedBecause(reason: string): string {
  return `Waived: ${reason}`;
}

export function appliedTo(labels: string[]): string {
  return `Applied to ${labels.join(" and ")}`;
}

export function partHeldAsCredit(amount: string): string {
  return `${amount} held as credit`;
}

export function showAllCharges(count: number): string {
  return `Show all ${count} charges`;
}
