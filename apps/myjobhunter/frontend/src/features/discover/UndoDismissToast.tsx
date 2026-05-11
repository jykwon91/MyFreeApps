/**
 * UndoDismissToast — a 5-second action toast shown after a job is dismissed.
 *
 * Renders a Radix Toast.Root within the existing Toast.Provider that the shared
 * Toaster mounts in RootLayout. The shared Toaster's Viewport at the top-right
 * corner will display this toast alongside the normal success/error toasts.
 *
 * Clicking "Undo" fires the undo-dismiss mutation and closes the toast. If the
 * toast expires without a click, the dismissal stands.
 *
 * Per `rules/visible-loading-feedback.md`: the Undo button is disabled while
 * the mutation is in flight (the round-trip is usually < 200ms, but the
 * disabled state prevents accidental double-fires).
 *
 * Design decision: self-contained here rather than extending the shared Toaster
 * because the shared toast-store only supports string messages with no action
 * button. If undo-style toasts become common across the app, extract the action
 * button pattern into shared-frontend at that point.
 */
import * as Toast from "@radix-ui/react-toast";
import { extractErrorMessage, showError } from "@platform/ui";
import { useUndoDismissDiscoveredJobMutation } from "@/store/discoverApi";

const UNDO_TOAST_DURATION_MS = 5000;

interface UndoDismissToastProps {
  /** The job that was just dismissed — used to call undo-dismiss. */
  jobId: string;
  /** Whether the toast is currently visible. */
  open: boolean;
  /** Called when the toast auto-expires or is manually closed. */
  onOpenChange: (open: boolean) => void;
}

export default function UndoDismissToast({
  jobId,
  open,
  onOpenChange,
}: UndoDismissToastProps) {
  const [undoDismiss, { isLoading: isUndoing }] =
    useUndoDismissDiscoveredJobMutation();

  async function handleUndo() {
    try {
      await undoDismiss(jobId).unwrap();
      onOpenChange(false);
    } catch (err) {
      showError(extractErrorMessage(err) ?? "Couldn't undo dismiss");
      onOpenChange(false);
    }
  }

  return (
    <Toast.Root
      open={open}
      onOpenChange={onOpenChange}
      duration={UNDO_TOAST_DURATION_MS}
      className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3 text-sm shadow-lg"
      data-testid="undo-dismiss-toast"
    >
      <Toast.Description className="flex-1 text-foreground">
        Dismissed.
      </Toast.Description>
      <Toast.Action asChild altText="Undo dismiss">
        <button
          type="button"
          onClick={handleUndo}
          disabled={isUndoing}
          className="shrink-0 font-medium text-primary underline hover:no-underline disabled:opacity-50"
          data-testid="undo-dismiss-button"
        >
          {isUndoing ? "Undoing…" : "Undo"}
        </button>
      </Toast.Action>
    </Toast.Root>
  );
}
