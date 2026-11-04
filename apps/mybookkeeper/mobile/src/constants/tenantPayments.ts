export const PAYMENTS_SHOWN_AT_FIRST = 6;

export const TENANT_PAYMENT_MESSAGES = {
  section: "Payments",
  loading: "Loading their payments",
  couldntLoad: "I couldn't load their payments.",
  tryAgain: "Try again",
  showFewer: "Show fewer",
  openHint: "Opens the transaction",
  unnamedPayer: "Payment",
} as const;

export function noPaymentsFrom(name: string): string {
  return `No payments from ${name} yet.`;
}

export function totalReceived(total: string): string {
  return `Total received: ${total}`;
}

export function includesDeposits(deposits: string): string {
  return `Includes ${deposits} in deposits.`;
}

export function showAllPayments(count: number): string {
  return `Show all ${count} payments`;
}
