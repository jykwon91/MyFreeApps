import { isNotFound } from "@platform/core/utils/isNotFound";

/**
 * Whether a delete leaves the record gone: it succeeded, or the server says it was never there (a 404,
 * deleted elsewhere or by a double tap). Takes the `queryFulfilled` an RTK Query `onQueryStarted` gets.
 */
export async function removalIsDone(queryFulfilled: Promise<unknown>): Promise<boolean> {
  try {
    await queryFulfilled;
    return true;
  } catch (rejection) {
    return typeof rejection === "object" && rejection !== null && "error" in rejection && isNotFound(rejection.error);
  }
}
