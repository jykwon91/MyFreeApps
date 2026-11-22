import { LoadingButton } from "@platform/ui";
import ResumeRefinementHeader from "@/features/resume_refinement/ResumeRefinementHeader";

interface SessionLoadErrorViewProps {
  /** True when the session no longer exists, so loading it again can't help. */
  isGone: boolean;
  isRetrying: boolean;
  onRetry: () => void;
  onStartNew: () => void;
}

export default function SessionLoadErrorView({ isGone, isRetrying, onRetry, onStartNew }: SessionLoadErrorViewProps) {
  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <ResumeRefinementHeader />
      <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm space-y-3">
        {isGone ? (
          <p>That session no longer exists. Start a new one to keep refining.</p>
        ) : (
          <p>We couldn't load that session. Check your connection and try again, or start a new one.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {isGone ? null : (
            <LoadingButton size="sm" isLoading={isRetrying} loadingText="Retrying…" onClick={onRetry}>
              Try again
            </LoadingButton>
          )}
          <LoadingButton size="sm" variant={isGone ? "primary" : "secondary"} onClick={onStartNew}>
            Start a new one
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}
