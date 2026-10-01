import { AlertBox, LoadingButton } from "@platform/ui";

interface LoadErrorRetryProps {
  /** What didn't load, e.g. "Couldn't load games." */
  message: string;
  onRetry: () => void;
  /** True while the retry is in flight. */
  retrying: boolean;
}

/**
 * A failed page load with a way out. "Please refresh the page" is a dead end
 * inside the Discord Activity — Discord's frame has no refresh button — so the
 * request is retried in place, and the button shows it's working.
 */
export default function LoadErrorRetry({ message, onRetry, retrying }: LoadErrorRetryProps) {
  return (
    <AlertBox variant="error">
      <div className="flex flex-wrap items-center gap-3">
        <span>{message}</span>
        <LoadingButton size="sm" variant="secondary" isLoading={retrying} loadingText="Retrying…" onClick={() => onRetry()}>
          Try again
        </LoadingButton>
      </div>
    </AlertBox>
  );
}
