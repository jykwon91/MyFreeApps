import { useState } from "react";
import type { LostCreateCheck } from "../types/write/lost-create-check";
import type { LostCreateRecheck } from "../types/write/lost-create-recheck";
import { newlyCreated } from "../utils/newlyCreated";
import { recheckLostCreate } from "../utils/recheckLostCreate";

/**
 * After an add's answer is lost, reads the list again and looks for a new item matching what was sent. `before` is the list as
 * this render holds it, so a recheck called from the handler that sent the add compares with the list from before it was sent.
 * With no list to compare with, it can't tell.
 */
export function useLostCreateRecheck<Request, T extends { id: string }>(
  before: readonly T[] | undefined,
  latest: () => Promise<readonly T[]>,
  matches: (item: T, request: Request) => boolean,
): LostCreateRecheck<Request, T> {
  const [isChecking, setIsChecking] = useState(false);

  async function recheck(request: Request): Promise<LostCreateCheck<T>> {
    if (!before) return { kind: "unknown" };
    setIsChecking(true);
    try {
      return await recheckLostCreate(async () => newlyCreated(before, await latest(), (item) => matches(item, request)));
    } finally {
      setIsChecking(false);
    }
  }

  return { recheck, isChecking };
}
