import type { Holding } from "@mybookkeeper/api-client/types/investments/holding";
import HoldingCard from "./HoldingCard";
import HoldingsTable from "./HoldingsTable";

export interface HoldingsListProps {
  holdings: Holding[];
  showAccount: boolean;
  onEdit: (holding: Holding) => void;
  onRemove: (holding: Holding) => void;
}

/** A table from md up, cards below it, so a phone never scrolls sideways. */
export default function HoldingsList({ holdings, showAccount, onEdit, onRemove }: HoldingsListProps) {
  return (
    <>
      <div className="hidden md:block">
        <HoldingsTable holdings={holdings} showAccount={showAccount} onEdit={onEdit} onRemove={onRemove} />
      </div>
      <ul className="space-y-2 md:hidden" data-testid="holdings-cards">
        {holdings.map((holding) => (
          <HoldingCard key={holding.id} holding={holding} showAccount={showAccount} onEdit={onEdit} onRemove={onRemove} />
        ))}
      </ul>
    </>
  );
}
