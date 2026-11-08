import { Link } from "react-router-dom";
import { ASK_COPY } from "@/games/wow-forever/data/ask/askCopy";
import { sitePagesMentioned } from "@/games/wow-forever/lib/ask/askFollowUps";

interface AskFollowUpsProps {
  answer: string;
}

/** The site pages an answer points to, as links (the answer itself is plain text). */
export default function AskFollowUps({ answer }: AskFollowUpsProps) {
  const pages = sitePagesMentioned(answer);
  if (pages.length === 0) return null;
  return (
    <nav aria-label={ASK_COPY.seeAlso} className="flex flex-wrap items-center gap-x-3 text-sm">
      <span className="text-muted-foreground">{ASK_COPY.seeAlso}:</span>
      {pages.map((page) => (
        <Link
          key={page.path}
          to={page.path}
          className="inline-flex min-h-[44px] items-center font-medium text-primary underline-offset-2 hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {page.title}
        </Link>
      ))}
    </nav>
  );
}
