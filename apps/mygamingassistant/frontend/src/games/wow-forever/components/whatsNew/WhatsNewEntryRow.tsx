import { Link } from "react-router-dom";
import { formatDate } from "@platform/ui";
import type { WhatsNewEntry } from "@/games/wow-forever/types/whatsNew/whatsNewEntry";

interface WhatsNewEntryRowProps {
  entry: WhatsNewEntry;
}

/** One "What's new" line: the whole row links to the page it's about. */
export default function WhatsNewEntryRow({ entry }: WhatsNewEntryRowProps) {
  return (
    <li>
      <Link to={entry.to} className="block rounded-md px-2 py-2 -mx-2 hover:bg-muted/40 transition-colors">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium text-primary">{entry.title}</span>
          <time dateTime={entry.date} className="text-xs text-muted-foreground">
            {formatDate(entry.date)}
          </time>
        </span>
        <span className="block text-sm text-muted-foreground">{entry.summary}</span>
      </Link>
    </li>
  );
}
