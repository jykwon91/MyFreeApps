import type { Scenario } from "./scenario";

/** What ``useScenarioPath`` gives the scenario list. */
export interface ScenarioPath {
  /** The language's display name, or its code until the languages load. */
  languageName: string;
  /** Undefined until both the languages and the scenarios have loaded. */
  scenarios: Scenario[] | undefined;
  isError: boolean;
  /** The latest catalog error, so a screen can tell a new failure from one it already showed. */
  error: unknown;
  /** Today's practice budget is used up. */
  isCapReached: boolean;
  /** Reloads the catalog and today's usage. */
  refetch: () => Promise<unknown>;
}
