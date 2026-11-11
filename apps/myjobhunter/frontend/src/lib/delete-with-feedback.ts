import { extractErrorMessage, isNotFound, showError, showSuccess } from "@platform/ui";

/**
 * Runs a delete and toasts how it went. A 404 means the record was already gone (deleted in another
 * tab, or by a double click), which is what was asked for, so it reads as done; the API slice has
 * already taken it off the cached list.
 */
export async function deleteWithFeedback(
  remove: () => Promise<unknown>,
  deletedMessage: string,
  failurePrefix: string,
): Promise<void> {
  try {
    await remove();
    showSuccess(deletedMessage);
  } catch (err) {
    if (isNotFound(err)) showSuccess(deletedMessage);
    else showError(`${failurePrefix}: ${extractErrorMessage(err)}`);
  }
}
