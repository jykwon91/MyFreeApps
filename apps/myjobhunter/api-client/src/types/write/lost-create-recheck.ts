import type { LostCreateCheck } from "./lost-create-check";

/** Asks the server whether an add whose answer was lost went through, saying it's still working while it asks. */
export interface LostCreateRecheck<Request, T> {
  recheck: (request: Request) => Promise<LostCreateCheck<T>>;
  isChecking: boolean;
}
