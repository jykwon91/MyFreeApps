import { Link2 } from "lucide-react";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { loginErrorAnchor } from "@/games/wow-forever/lib/serverStatus/searchLoginErrors";
import type { LoginErrorEntry } from "@/games/wow-forever/types/serverStatus/loginErrorEntry";

interface LoginErrorCardProps {
  entry: LoginErrorEntry;
  /** True when the URL's `#err-…` names this entry. */
  targeted: boolean;
}

/** One login problem: the code / message, what it means and what to try, with a link to itself. */
export default function LoginErrorCard({ entry, targeted }: LoginErrorCardProps) {
  const anchor = loginErrorAnchor(entry);
  return (
    <li
      id={anchor}
      data-targeted={targeted}
      className={`scroll-mt-20 rounded-lg border p-3 sm:p-4 space-y-2 ${targeted ? "ring-2 ring-primary" : ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {entry.code ? <span className="mr-2 font-mono">{entry.code}</span> : null}
          <span className={entry.code ? "font-normal text-muted-foreground" : ""}>{entry.title}</span>
        </h3>
        <ProvenanceBadge {...entry.provenance} />
      </div>
      <p className="text-sm">{entry.meaning}</p>
      <div className="space-y-1">
        <p className="text-sm font-medium">What to try</p>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {entry.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
      <a
        href={`#${anchor}`}
        className="inline-flex min-h-[44px] items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground sm:min-h-0"
      >
        <Link2 className="h-3.5 w-3.5" aria-hidden />
        Link to this error
      </a>
    </li>
  );
}
