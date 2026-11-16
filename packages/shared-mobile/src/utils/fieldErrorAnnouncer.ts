import { AccessibilityInfo } from "react-native";
import { fieldErrorsSummary } from "../constants/formField";

interface PendingFieldError {
  fieldName: string;
  error: string;
}

let pending: PendingFieldError[] = [];

function flush(): void {
  const batch = pending;
  pending = [];
  const message = batch.length === 1 ? batch[0].error : fieldErrorsSummary(batch.map(({ fieldName }) => fieldName));
  // Queued behind current speech: a save's errors wait for the button's own feedback, and an
  // error that shows up while typing doesn't cut off the typing echo.
  AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: true });
}

/**
 * Collects the field errors that appear in one render and reads them as one message: a failed save
 * sets every field's error at once, and separate announcements would cut each other off on iOS, so
 * only the last field's would be heard. A promise, not a timer, so a test's fake clock doesn't hold it.
 */
export function announceFieldError(fieldName: string, error: string): void {
  pending.push({ fieldName, error });
  if (pending.length === 1) void Promise.resolve().then(flush);
}
