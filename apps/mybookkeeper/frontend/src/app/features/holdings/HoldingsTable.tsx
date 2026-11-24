import type { Holding } from "@mybookkeeper/api-client/types/investments/holding";
import { formatAccountBalance } from "@mybookkeeper/api-client/utils/financialAccountFormat";
import { formatPrice, formatQuantity } from "@mybookkeeper/api-client/utils/holdingFormat";
import { HOLDINGS_MESSAGES as MSG } from "@/shared/lib/holdings-messages";
import HoldingActions from "./HoldingActions";
import HoldingGainLoss from "./HoldingGainLoss";
import HoldingPriceAsOf from "./HoldingPriceAsOf";
import { holdingLabel } from "./holding-label";

export interface HoldingsTableProps {
  holdings: Holding[];
  /** Name the account on each row when every account is shown. */
  showAccount: boolean;
  onEdit: (holding: Holding) => void;
  onRemove: (holding: Holding) => void;
}

const NUMBER_CELL = "px-3 py-2 text-right tabular-nums align-top";

/** The holdings on a wide screen, one row each; phones get HoldingCard instead. */
export default function HoldingsTable({ holdings, showAccount, onEdit, onRemove }: HoldingsTableProps) {
  return (
    <table className="w-full text-sm" data-testid="holdings-table">
      <thead className="text-xs text-muted-foreground border-b">
        <tr>
          <th scope="col" className="px-3 py-2 text-left font-medium">{MSG.columnHolding}</th>
          <th scope="col" className="px-3 py-2 text-right font-medium">{MSG.columnQuantity}</th>
          <th scope="col" className="px-3 py-2 text-right font-medium">{MSG.columnPrice}</th>
          <th scope="col" className="px-3 py-2 text-right font-medium">{MSG.columnValue}</th>
          <th scope="col" className="px-3 py-2 text-right font-medium">{MSG.columnCostBasis}</th>
          <th scope="col" className="px-3 py-2 text-right font-medium">{MSG.columnGainLoss}</th>
          <th scope="col" className="px-3 py-2 text-right font-medium"><span className="sr-only">{MSG.columnActions}</span></th>
        </tr>
      </thead>
      <tbody>
        {holdings.map((holding) => (
          <tr key={holding.id} className="border-b last:border-b-0" data-testid={`holding-row-${holding.id}`}>
            <td className="px-3 py-2 align-top min-w-0">
              <p className="font-medium" data-testid="holding-label">{holdingLabel(holding)}</p>
              {holding.ticker_symbol && holding.name ? (
                <p className="text-xs text-muted-foreground truncate max-w-[16rem]">{holding.name}</p>
              ) : null}
              {showAccount ? <p className="text-xs text-muted-foreground">{holding.account_name}</p> : null}
            </td>
            <td className={NUMBER_CELL}>{formatQuantity(holding.quantity)}</td>
            <td className={NUMBER_CELL}>
              <div>{formatPrice(holding.price, holding.currency)}</div>
              <HoldingPriceAsOf holding={holding} />
            </td>
            <td className={`${NUMBER_CELL} font-medium`} data-testid="holding-value">
              {holding.value_cents === null ? "—" : formatAccountBalance(holding.value_cents, holding.currency)}
            </td>
            <td className={NUMBER_CELL}>
              {holding.cost_basis_cents === null ? "—" : formatAccountBalance(holding.cost_basis_cents, holding.currency)}
            </td>
            <td className={NUMBER_CELL}>
              <HoldingGainLoss cents={holding.gain_loss_cents} percent={holding.gain_loss_percent} currency={holding.currency} />
            </td>
            <td className="px-3 py-2 text-right align-top">
              <HoldingActions holding={holding} onEdit={onEdit} onRemove={onRemove} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
