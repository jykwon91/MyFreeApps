import { LoadingButton } from "@platform/ui";

interface Props {
  heading?: string;
  message: string;
  retryLabel: string;
  isRetrying: boolean;
  onRetry: () => void;
}

/** A section that couldn't load says so where its content would be, with a way to try again. */
export default function SectionLoadFailed({ heading, message, retryLabel, isRetrying, onRetry }: Props) {
  return (
    <div role="alert" className="space-y-3">
      {heading ? <p className="text-sm font-medium text-destructive">{heading}</p> : null}
      <p className="text-sm text-destructive">{message}</p>
      <LoadingButton variant="secondary" size="sm" isLoading={isRetrying} onClick={onRetry}>
        {retryLabel}
      </LoadingButton>
    </div>
  );
}
