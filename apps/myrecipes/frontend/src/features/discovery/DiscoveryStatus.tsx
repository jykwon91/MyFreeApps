import { useEffect, useState } from "react";
import Spinner from "@platform/ui/components/icons/Spinner";

interface Props {
  /** Ordered stages; each replaces the last after `stepSeconds`. */
  stages: readonly string[];
  stepSeconds?: number;
}

/**
 * The status line above a discovery wait.
 *
 * Searching the web and reading a page both take tens of seconds — long enough
 * that one frozen sentence stops reading as "working" and starts reading as
 * "stuck". The stages advance on a timer to show the wait is progressing.
 * They describe what the request is doing in order, so nothing here claims
 * knowledge of the server's actual progress that we don't have.
 */
export default function DiscoveryStatus({ stages, stepSeconds = 9 }: Props) {
  const [index, setIndex] = useState(0);

  // One interval per mount. The stage list is fixed for a given wait and the
  // component unmounts when the wait ends, so there is no reset to do here.
  useEffect(() => {
    if (stages.length <= 1) return;
    const timer = setInterval(
      () => setIndex((i) => Math.min(i + 1, stages.length - 1)),
      stepSeconds * 1000,
    );
    return () => clearInterval(timer);
  }, [stages, stepSeconds]);

  return (
    <p
      className="flex items-center gap-2 text-sm text-muted-foreground"
      aria-live="polite"
    >
      <Spinner className="h-4 w-4 text-primary" />
      {stages[index]}
    </p>
  );
}
