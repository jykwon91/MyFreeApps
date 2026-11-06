import { Button, Skeleton } from "@platform/ui";
import { useGetFinancialsQuery } from "@/store/financialsApi";
import SummaryCard from "@/features/financials/SummaryCard";
import ExpensesSection from "@/features/financials/ExpensesSection";
import type { FinancialsBodyProps } from "@/types/financials/FinancialsBodyProps";

export default function FinancialsBody({ dropId }: FinancialsBodyProps) {
  const { data, isLoading, isError, refetch } = useGetFinancialsQuery(dropId);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (isError || !data) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive">Failed to load financials.</p>
        <Button size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const readOnly = data.drop.status === "closed";

  return (
    <div className="space-y-4">
      <SummaryCard data={data} readOnly={readOnly} />
      <ExpensesSection data={data} readOnly={readOnly} />
    </div>
  );
}
