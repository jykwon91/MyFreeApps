/** What a drill-down carries in its address. Every value is text, empty when not set. */
export interface DrillDownParams extends Record<string, string> {
  label: string;
  category: string;
  property: string;
  properties: string;
  type: string;
  from: string;
  to: string;
}
