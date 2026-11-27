import { Link } from "react-router-dom";
import type { SavingsIdea } from "@mybookkeeper/api-client/types/savings/savings-idea";
import { formatSavingsTime, sourceSiteName } from "@mybookkeeper/api-client/utils/savingsFormat";
import { SAVINGS_MESSAGES as MSG } from "@/shared/lib/savings-messages";
import { SAVINGS_CATEGORY_PAGES } from "@/shared/lib/savings-pages";
import SavingsCardTerms from "./SavingsCardTerms";
import SavingsIdeaActions from "./SavingsIdeaActions";

export interface SavingsIdeaDetailsProps {
  idea: SavingsIdea;
  id: string;
}

/** An idea opened up: why it fits, the steps, card terms, where to act in the app, and the sources. */
export default function SavingsIdeaDetails({ idea, id }: SavingsIdeaDetailsProps) {
  const appPage = SAVINGS_CATEGORY_PAGES[idea.category];

  return (
    <div id={id} className="border-t px-4 py-3 space-y-4" data-testid="savings-idea-details">
      <div className="space-y-1">
        <h4 className="text-sm font-medium">{MSG.whyItFits}</h4>
        <p className="text-sm text-muted-foreground">{idea.why_it_fits}</p>
      </div>
      {idea.steps.length > 0 ? (
        <div className="space-y-1">
          <h4 className="text-sm font-medium">{MSG.steps}</h4>
          <ol className="list-decimal pl-5 space-y-1 text-sm" data-testid="savings-idea-steps">
            {idea.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}
      {idea.card_details !== null ? <SavingsCardTerms details={idea.card_details} /> : null}
      {appPage !== undefined ? (
        <Link
          to={appPage.to}
          className="inline-flex min-h-[44px] items-center text-sm font-medium text-primary hover:underline"
          data-testid="savings-idea-app-link"
        >
          {appPage.label}
        </Link>
      ) : null}
      {idea.source_urls.length > 0 ? (
        <div className="space-y-1">
          <h4 className="text-sm font-medium">{MSG.sources}</h4>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" data-testid="savings-idea-sources">
            {idea.source_urls.map((url) => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center text-primary hover:underline break-all"
                >
                  {sourceSiteName(url)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SavingsIdeaActions ideaId={idea.id} />
        <p className="text-xs text-muted-foreground">{MSG.lastChecked(formatSavingsTime(idea.last_confirmed_at))}</p>
      </div>
    </div>
  );
}
