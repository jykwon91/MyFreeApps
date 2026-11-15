import { Link } from "react-router-dom";
import { LoadingButton } from "@platform/ui";
import Skeleton from "@/shared/components/ui/Skeleton";

interface InviteAcceptStatusProps {
  orgName: string;
  isAccepting: boolean;
  error: string | null;
  onRetry: () => void;
}

export default function InviteAcceptStatus({ orgName, isAccepting, error, onRetry }: InviteAcceptStatusProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted">
      <div className="bg-card border rounded-lg p-8 w-full max-w-sm shadow-sm text-center space-y-3">
        {error ? (
          <>
            <h1 className="text-lg font-semibold text-destructive">Couldn&apos;t join {orgName}</h1>
            <p role="alert" className="text-sm text-muted-foreground">{error}</p>
            <LoadingButton isLoading={isAccepting} loadingText="Trying again..." onClick={onRetry} className="w-full">
              Try again
            </LoadingButton>
            <Link
              to="/"
              className="block text-sm font-medium text-primary hover:underline min-h-[44px] leading-[44px]"
            >
              Go to dashboard
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold">Joining {orgName}...</h1>
            <Skeleton className="h-4 w-40 mx-auto" />
          </>
        )}
      </div>
    </div>
  );
}
