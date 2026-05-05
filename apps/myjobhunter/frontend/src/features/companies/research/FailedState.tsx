import { LoadingButton } from "@platform/ui";

interface FailedStateProps {
  errorMessage: string | null;
  onRunResearch: () => void;
  isRunning: boolean;
}

export default function FailedState({ errorMessage, onRunResearch, isRunning }: FailedStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <p className="text-sm text-destructive">
        {errorMessage ?? "Research failed. Please try again."}
      </p>
      <LoadingButton isLoading={isRunning} onClick={onRunResearch}>
        Retry
      </LoadingButton>
    </div>
  );
}
