import { useState } from "react";

/** Whether a query has failed since this screen opened; a failure still cached from before doesn't count. */
export function useErrorSinceOpening(error: unknown, isError: boolean): boolean {
  const [errorOnOpening] = useState(error);
  return isError && error !== errorOnOpening;
}
