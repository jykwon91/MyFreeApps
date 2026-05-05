import { LoadingButton } from "@platform/ui";

interface NoResearchStateProps {
  onRunResearch: () => void;
  isRunning: boolean;
}

export default function NoResearchState({ onRunResearch, isRunning }: NoResearchStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <p className="text-sm text-muted-foreground max-w-xs">
        No research has been run yet. Click below to fetch reviews, compensation
        signals, and culture notes from the web.
      </p>
      <LoadingButton isLoading={isRunning} onClick={onRunResearch} className="mt-1">
        Run research
      </LoadingButton>
    </div>
  );
}
