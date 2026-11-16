import { useEffect, useRef } from "react";
import { announceFieldError } from "../utils/fieldErrorAnnouncer";

/** Has the screen reader read a field's error once when it appears or changes, together with any other field's that appears in the same render. */
export function useFieldErrorAnnouncement(fieldName: string, error: string | undefined): void {
  // The name only says which field it was, so a renamed field (a row that moved) doesn't re-read its error.
  const name = useRef(fieldName);
  useEffect(() => {
    name.current = fieldName;
  }, [fieldName]);

  useEffect(() => {
    if (error) announceFieldError(name.current, error);
  }, [error]);
}
