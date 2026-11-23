import { LoadingRegion, Skeleton } from "@platform/ui";
import ListLoadError from "@/components/ListLoadError";
import { APPLICATION_COMPANY_MESSAGES as MESSAGES } from "@/constants/application-company-messages";

export interface ApplicationCompanyNameProps {
  name: string | undefined;
  isError: boolean;
  onRetry: () => Promise<unknown>;
}

/** The company line under an application's title: the name, or a skeleton while it loads, or a retry when it can't. */
export default function ApplicationCompanyName({ name, isError, onRetry }: ApplicationCompanyNameProps) {
  if (name !== undefined) return <p className="text-sm text-muted-foreground">{name}</p>;
  if (isError) return <ListLoadError message={MESSAGES.couldntLoad} retryLabel={MESSAGES.tryAgain} onRetry={onRetry} />;
  return (
    <LoadingRegion label={`${MESSAGES.loading}…`}>
      <Skeleton className="h-4 w-32" />
    </LoadingRegion>
  );
}
