import { cn } from "@/shared/utils/cn";
import Card from "@/shared/components/ui/Card";
import type { HealthSummary } from "@/shared/types/health/health-summary";

interface StatsGridProps {
  stats: NonNullable<HealthSummary["stats"]>;
}

export default function StatsGrid({ stats }: StatsGridProps) {
  const cards = [
    {
      label: "Documents Processing",
      value: stats.documents_processing,
      highlight: stats.documents_processing > 0,
      highlightClass: "text-blue-600 dark:text-blue-400",
    },
    {
      label: "Documents Failed",
      value: stats.documents_failed,
      highlight: stats.documents_failed > 0,
      highlightClass: "text-red-600 dark:text-red-400",
    },
    {
      label: "Retry Pending",
      value: stats.documents_retry_pending,
      highlight: false,
      highlightClass: "",
    },
    {
      label: "Extractions Today",
      value: stats.extractions_today,
      highlight: false,
      highlightClass: "",
    },
    {
      label: "Corrections Today",
      value: stats.corrections_today,
      highlight: false,
      highlightClass: "",
    },
    {
      label: "API Tokens Today",
      value: stats.api_tokens_today,
      highlight: false,
      highlightClass: "",
    },
  ];

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {cards.map((card) => (
        <Card key={card.label}>
          <p className="text-sm text-muted-foreground">{card.label}</p>
          <p
            className={cn(
              "text-2xl font-semibold mt-1",
              card.highlight ? card.highlightClass : undefined,
            )}
          >
            {card.value.toLocaleString()}
          </p>
        </Card>
      ))}
    </section>
  );
}
