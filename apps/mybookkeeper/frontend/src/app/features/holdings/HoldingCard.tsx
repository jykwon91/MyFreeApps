import type { Holding } from "@mybookkeeper/api-client/types/investments/holding";
import { formatAccountBalance } from "@mybookkeeper/api-client/utils/financialAccountFormat";
import { formatPrice, formatQuantity } from "@mybookkeeper/api-client/utils/holdingFormat";
import { HOLDINGS_MESSAGES as MSG } from "@/shared/lib/holdings-messages";
import HoldingActions from "./HoldingActions";
import HoldingGainLoss from "./HoldingGainLoss";
import HoldingPriceAsOf from "./HoldingPriceAsOf";
import { holdingLabel } from "./holding-label";

export interface HoldingCardProps {
  holding: Holding;
  showAccount: boolean;
  onEdit: (holding: Holding) => void;
  onRemove: (holding: Holding) => void;
}

/** One holding on a phone: what it is and its value on top, the detail underneath. */
export default function HoldingCard({ holding, showAccount, onEdit, onRemove }: HoldingCardProps) {
  const details = [holding.ticker_symbol ? holding.name : null, showAccount ? holding.account_name : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="border rounded-lg px-4 py-3 text-sm" data-testid={`holding-card-${holding.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium truncate" data-testid="holding-label">{holdingLabel(holding)}</p>
          {details ? <p className="text-xs text-muted-foreground mt-0.5 truncate">{details}</p> : null}
        </div>
        <p className="font-semibold tabular-nums shrink-0" data-testid="holding-value">
          {holding.value_cents === null ? "—" : formatAccountBalance(holding.value_cents, holding.currency)}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-xs">
        <dt className="text-muted-foreground">{MSG.columnQuantity}</dt>
        <dd className="text-right tabular-nums">{formatQuantity(holding.quantity)}</dd>
        <dt className="text-muted-foreground">{MSG.columnPrice}</dt>
        <dd className="text-right tabular-nums">
          <div>{formatPrice(holding.price, holding.currency)}</div>
          <HoldingPriceAsOf holding={holding} />
        </dd>
        <dt className="text-muted-foreground">{MSG.columnCostBasis}</dt>
        <dd className="text-right tabular-nums">
          {holding.cost_basis_cents === null ? "—" : formatAccountBalance(holding.cost_basis_cents, holding.currency)}
        </dd>
        <dt className="text-muted-foreground">{MSG.columnGainLoss}</dt>
        <dd className="text-right">
          <HoldingGainLoss
            cents={holding.gain_loss_cents} percent={holding.gain_loss_percent} currency={holding.currency} layout="inline"
          />
        </dd>
      </dl>
      <div className="mt-2 flex justify-end">
        <HoldingActions holding={holding} onEdit={onEdit} onRemove={onRemove} />
      </div>
    </li>
  );
}
