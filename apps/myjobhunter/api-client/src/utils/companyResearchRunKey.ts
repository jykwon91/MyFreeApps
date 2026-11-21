/** The store key every screen shares for one company's research run, so a reopened company still sees its run in flight. */
export function companyResearchRunKey(companyId: string): string {
  return `company-research-${companyId}`;
}
