import { isCancelledRequest } from "@platform/core/utils/isCancelledRequest";
import type { LostCreateCheck } from "../types/write/lost-create-check";

/**
 * Asks the server whether an add whose answer was lost went through. `find` reads it again and resolves to
 * what the add made, or undefined when it isn't there. A read that fails can't tell either way.
 */
export async function recheckLostCreate<T>(find: () => Promise<T | undefined>): Promise<LostCreateCheck<T>> {
  try {
    const item = await find();
    return item === undefined ? { kind: "notCreated" } : { kind: "created", item };
  } catch (error) {
    return isCancelledRequest(error) ? { kind: "cancelled" } : { kind: "unknown" };
  }
}
