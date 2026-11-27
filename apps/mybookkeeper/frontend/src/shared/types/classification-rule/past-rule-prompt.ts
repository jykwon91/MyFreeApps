/** The open "file past payments too?" question: which rule, for which payee, and how many payments it would refile. */
export interface PastRulePrompt {
  ruleId: string;
  payee: string;
  count: number;
}
