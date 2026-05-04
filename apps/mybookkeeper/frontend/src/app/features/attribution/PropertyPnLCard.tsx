import { Building2, TrendingUp, TrendingDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Card from "@/shared/components/ui/Card";
import { formatCurrency } from "@/shared/utils/currency";
import { formatTag } from "@/shared/utils/tag";
import type { PropertyPnLEntry } from "@/shared/types/attribution/property-pnl";

interface Props {
  entry: PropertyPnLEntry;
  dateRange: { since: string; until: string };
}

const centsToAmount = (cents: number) => cents / 100;

export default function PropertyPnLCard({ entry, dateRange }: Props) {
  const navigate = useNavigate();
  const isProfit = entry.net_cents >= 0;

  const handleClick = () => {
    navigate(
      `/transactions?property_id=${entry.property_id}&start_date=${dateRange.since}&end_date=${dateRange.until}`,
    );
  };

  return (
    <button
      onClick={handleClick}
      className="w-full text-left focus:outline-none focus:ring-2 focus:ring-primary rounded-lg"
      aria-label={`View transactions for ${entry.name}`}
    >
      <Card className="hover:bg-muted/40 transition-colors cursor-pointer space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
            <h3 className="font-medium truncate">{entry.name}</h3>
          </div>
          <div className={`flex items-center gap-1 text-sm font-semibold shrink-0 ${isProfit ? "text-green-600" : "text-red-500"}`}>
            {isProfit ? (
              <TrendingUp className="h-4 w-4" aria-hidden="true" />
            ) : (
              <TrendingDown className="h-4 w-4" aria-hidden="true" />
            )}
            {formatCurrency(centsToAmount(entry.net_cents))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Revenue</p>
            <p className="text-sm font-medium text-green-600">
              {formatCurrency(centsToAmount(entry.revenue_cents))}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Expenses</p>
            <p className="text-sm font-medium text-red-500">
              {formatCurrency(centsToAmount(entry.expenses_cents))}
            </p>
          </div>
        </div>

        {entry.expense_breakdown.length > 0 && (
          <div className="space-y-1">
            {entry.expense_breakdown.slice(0, 4).map((item) => (
              <div key={item.category} className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="truncate">{formatTag(item.category)}</span>
                <span className="shrink-0 ml-2">{formatCurrency(centsToAmount(item.amount_cents))}</span>
              </div>
            ))}
            {entry.expense_breakdown.length > 4 && (
              <p className="text-xs text-muted-foreground">
                +{entry.expense_breakdown.length - 4} more categories
              </p>
            )}
          </div>
        )}
      </Card>
    </button>
  );
}
