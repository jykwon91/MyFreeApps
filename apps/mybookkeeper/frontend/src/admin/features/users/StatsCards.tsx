import Card from "@/shared/components/ui/Card";
import Skeleton from "@/shared/components/ui/Skeleton";

interface PlatformStats {
  total_users: number;
  active_users: number;
  inactive_users: number;
  total_organizations: number;
  total_transactions: number;
  total_documents: number;
}

interface StatsCardsProps {
  stats: PlatformStats | undefined;
  isLoading: boolean;
}

export default function StatsCards({ stats, isLoading }: StatsCardsProps) {
  const cards = [
    {
      label: "Total Users",
      value: stats?.total_users,
      detail: stats
        ? `${stats.active_users} active, ${stats.inactive_users} inactive`
        : undefined,
    },
    { label: "Organizations", value: stats?.total_organizations },
    { label: "Transactions", value: stats?.total_transactions },
    { label: "Documents", value: stats?.total_documents },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.label}>
          <p className="text-sm text-muted-foreground">{card.label}</p>
          {isLoading ? (
            <Skeleton className="h-8 w-20 mt-1" />
          ) : (
            <>
              <p className="text-2xl font-semibold mt-1">
                {card.value?.toLocaleString() ?? "\u2014"}
              </p>
              {card.detail ? (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {card.detail}
                </p>
              ) : null}
            </>
          )}
        </Card>
      ))}
    </div>
  );
}
