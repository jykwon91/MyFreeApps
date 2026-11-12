import type { PracticeTarget } from "./practice-target";

/** What ``usePracticeScenario`` gives the practice screen. */
export interface PracticeScenario {
  /** Undefined until both lists load; null when the language or the scenario isn't offered. */
  target: PracticeTarget | null | undefined;
  isError: boolean;
  /** The latest catalog error, so a screen can tell a new failure from one it already showed. */
  error: unknown;
  /** Reloads both lists. */
  refetch: () => Promise<unknown>;
}
