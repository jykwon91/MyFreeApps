import Skeleton from "@/shared/components/ui/Skeleton";
import Card from "@/shared/components/ui/Card";
import { formatCurrency } from "@/shared/utils/currency";
import { useGetPropertyPnlQuery } from "@/shared/store/attributionApi";
import PropertyPnLCard from "./PropertyPnLCard";

interface Props {
  since: string;
  until: string;
}

const centsToAmount = (cents: number) => cents / 100;

export default function PropertyPnLGrid({ since, until }: Props) {
  const { data, isLoading } = useGetPropertyPnlQuery({ since, until });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.properties.length === 0) {
    return (
      <Card>
        <div className="py-8 text-center text-sm text-muted-foreground">
          No property data for this period.
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Roll-up row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Revenue</p>
          <p className="text-xl font-semibold text-green-600">
            {formatCurrency(centsToAmount(data.total_revenue_cents))}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Expenses</p>
          <p className="text-xl font-semibold text-red-500">
            {formatCurrency(centsToAmount(data.total_expenses_cents))}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Net Profit</p>
          <p className={`text-xl font-semibold ${data.total_net_cents >= 0 ? "text-green-600" : "text-red-500"}`}>
            {formatCurrency(centsToAmount(data.total_net_cents))}
          </p>
        </Card>
      </div>

      {/* Per-property cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.properties.map((entry) => (
          <PropertyPnLCard
            key={entry.property_id}
            entry={entry}
            dateRange={{ since, until }}
          />
        ))}
      </div>
    </div>
  );
}
