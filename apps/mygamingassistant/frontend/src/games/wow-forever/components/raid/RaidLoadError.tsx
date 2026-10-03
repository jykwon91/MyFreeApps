import { LoadingButton } from "@platform/ui";
import RaidPageMeta from "@/games/wow-forever/components/raid/RaidPageMeta";
import { RAID_MAIN_CLASS } from "@/games/wow-forever/data/raidPage";

interface RaidLoadErrorProps {
  message: string;
  isRetrying: boolean;
  onRetry: () => void;
}

/** The raid couldn't be read — too many requests, the server, the network: what happened, and [Retry]. */
export default function RaidLoadError({ message, isRetrying, onRetry }: RaidLoadErrorProps) {
  return (
    <main className={RAID_MAIN_CLASS}>
      <RaidPageMeta title="Raid" />
      <section aria-labelledby="raid-load-error" className="space-y-3 rounded-xl border bg-card p-6">
        <h1 id="raid-load-error" className="text-xl font-semibold">
          Couldn't load this raid
        </h1>
        <p role="alert" className="text-sm text-muted-foreground">
          {message}
        </p>
        <LoadingButton variant="secondary" isLoading={isRetrying} loadingText="Retrying" onClick={onRetry}>
          Retry
        </LoadingButton>
      </section>
    </main>
  );
}
