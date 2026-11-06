import { Lightbulb } from "lucide-react";
import { Link } from "react-router-dom";
import { SUGGEST_COPY } from "@/games/wow-forever/data/featureRequests/suggestCopy";
import { suggestPagePath } from "@/games/wow-forever/lib/featureRequests/boardParams";
import type { FeatureArea } from "@/games/wow-forever/types/featureRequests/featureArea";

interface WowSuggestFooterLinkProps {
  /** The page's area, so the board opens on what players asked for here. Null: every area. */
  area: FeatureArea | null;
}

/** "Missing something? Suggest a feature" — under every WoW Forever page but the suggest page itself. */
export default function WowSuggestFooterLink({ area }: WowSuggestFooterLinkProps) {
  return (
    <footer className="max-w-4xl border-t px-4 py-4 sm:px-8">
      <Link
        to={suggestPagePath(area)}
        data-testid="wow-suggest-footer-link"
        className="inline-flex min-h-[44px] items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <Lightbulb className="h-4 w-4" aria-hidden />
        {SUGGEST_COPY.footer}
      </Link>
    </footer>
  );
}
