import { Link } from "react-router-dom";
import type { NetWorthLine } from "@mybookkeeper/api-client/types/net-worth/net-worth-line";
import { formatAccountBalance } from "@mybookkeeper/api-client/utils/financialAccountFormat";
import { NET_WORTH_MESSAGES as MSG } from "@/shared/lib/net-worth-messages";
import { NET_WORTH_UPDATE_PAGES } from "@/shared/lib/net-worth-update-pages";
import { netWorthLineNote } from "./net-worth-line-note";
import PropertyValueAction from "./PropertyValueAction";

export interface NetWorthLineRowProps {
  line: NetWorthLine;
  totalCurrency: string;
}

/**
 * One account, loan or property. A property's value is edited right here; an
 * out-of-date balance links to the page that edits it.
 */
export default function NetWorthLineRow({ line, totalCurrency }: NetWorthLineRowProps) {
  const flagged = line.is_stale || line.amount_cents === null;

  return (
    <li className="border rounded-lg px-4 py-3 text-sm" data-testid={`net-worth-line-${line.id}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium truncate min-w-0">{line.name}</p>
        <p className="font-semibold tabular-nums shrink-0" data-testid="net-worth-line-amount">
          {line.amount_cents === null ? "—" : formatAccountBalance(line.amount_cents, line.currency)}
        </p>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-x-3 mt-0.5 text-xs">
        {line.detail ? <p className="text-muted-foreground truncate min-w-0">{line.detail}</p> : null}
        <p
          className={`ml-auto text-right ${flagged ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}
          data-testid="net-worth-line-note"
        >
          {netWorthLineNote(line, totalCurrency)}
        </p>
      </div>
      {line.source === "property" ? <PropertyValueAction line={line} /> : null}
      {line.source !== "property" && line.is_stale ? (
        <div className="mt-2">
          <Link
            to={NET_WORTH_UPDATE_PAGES[line.source]}
            className="inline-flex min-h-[44px] items-center text-sm font-medium text-primary hover:underline"
            data-testid="net-worth-update-link"
          >
            {MSG.update}
          </Link>
        </div>
      ) : null}
    </li>
  );
}
