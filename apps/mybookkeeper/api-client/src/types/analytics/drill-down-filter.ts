import type { DrillDownScope } from "./drill-down-scope";

/** Which approved transactions sit behind a number on the dashboard, with the words the website shows over them. */
export interface DrillDownFilter extends DrillDownScope {
  label: string;
}
