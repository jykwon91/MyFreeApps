import { ConfirmDialog } from "@platform/ui";
import { useEffect } from "react";
import { useBlocker } from "react-router-dom";

interface UnsavedChangesGuardProps {
  /** The leader has changes Save hasn't sent. */
  when: boolean;
}

/**
 * Asks before the leader leaves with unsaved groups: a link inside the app asks here; closing or reloading the tab
 * gets the browser's own prompt.
 */
export default function UnsavedChangesGuard({ when }: UnsavedChangesGuardProps) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => when && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!when) return undefined;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [when]);
  return (
    <ConfirmDialog
      open={blocker.state === "blocked"}
      title="Leave without saving?"
      description="Your changes to the groups aren't saved yet."
      confirmLabel="Leave"
      cancelLabel="Stay"
      variant="danger"
      onConfirm={() => blocker.proceed?.()}
      onCancel={() => blocker.reset?.()}
    />
  );
}
