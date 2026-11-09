export const RATE_WATCH_MESSAGES = {
  title: "Check for rate increases",
  blurb: "I look at the landlord-policy rate filings the Texas Department of Insurance publishes and match them to the policies you hold.",
  check: "Check filings",
  checking: "Checking filings…",
  loading: "Checking the rate filings",
  idle:
    "Texas carriers have to file a rate change with the state before they can charge it, months before your renewal notice arrives. I check those filings against every policy you hold. A landlord policy is placed through an agent, so there's no online marketplace. If it's worth switching, you'll still call your agent. I just tell you who to ask about.",
  error: "I couldn't reach the filing data. Nothing is wrong with your policies. Try again shortly.",
  empty: "You don't have any active policies yet. Add one and I'll have something to check the filings against.",
  whatToDo: "What to do",
  askAgentNamed: "Ask your agent to quote",
  askAgentNamedTail: "Texas filings show them holding dwelling rates flat or cutting them recently.",
  askAgentUnnamed: "Ask your agent whether another carrier will quote your property",
  askAgentUnnamedTail: "Texas's dwelling filings don't currently show anyone holding rates flat that I could name.",
  cantBuyOnline: "A landlord policy can't be bought online, so your agent is the only way to get a real number for your property.",
  renews: "Renews",
  estimated: "estimated",
  holdingFlat: "Holding rates flat",
  holdingFlatBlurb: "Worth asking your agent about. The last dwelling rate each of these filed was unchanged or lower.",
  raising: "Raising rates",
  raisingBlurb: "Filed an increase that hasn't reached renewals yet.",
  unnamedProgram: "Unnamed program",
  renewalsFrom: "renewals from",
  beforeDate: (date: string) => ` before ${date}`,
  caveat:
    "Filings come from the Texas Department of Insurance. Every figure here is a statewide average across a carrier's whole book, not a quote for your property. Your own renewal also moves with your coverage amount and claims history.",
} as const;

export function showMoreLabel(count: number): string {
  return `Show ${count} more`;
}
