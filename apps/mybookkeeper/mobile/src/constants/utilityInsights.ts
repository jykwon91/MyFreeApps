export const UTILITY_RENEWAL_MESSAGES = {
  lapsedHeading: "Already lapsed, likely on a holdover rate",
  expiringHeading: (days: number) => `Expiring within ${days} days`,
  allClearHeading: "All clear",
  allClear: (days: number) => `No utility plans need renewing in the next ${days} days.`,
  couldntLoad: "I couldn't load your renewals.",
  tryAgainOffer: "Want me to try again?",
  tryAgain: "Try again",
  loading: "Loading your renewals",
} as const;

export const UTILITY_RATE_CHECK_MESSAGES = {
  noBenchmark: "No market rate recorded yet, so nothing is being checked against your plans.",
  recordRate: "Record a market rate",
  allClearHeading: "All clear",
  allClear: (gapPct: number) => `No plan is priced more than ${gapPct}% above the market rate you recorded.`,
  aboveHeading: (gapPct: number) => `More than ${gapPct}% above market`,
  notCheckedHeading: (count: number) => `Not checked (${count})`,
  staleRow: "recorded a while ago",
  staleCard: "Some market rates were recorded a while ago and are worth rechecking.",
  planFigure: (figure: string) => `Your plan: ${figure}`,
  marketFigure: (figure: string) => `Market: ${figure}`,
  couldntLoad: "I couldn't check your rates.",
  tryAgainOffer: "Want me to try again?",
  tryAgain: "Try again",
  loading: "Checking your rates",
} as const;
