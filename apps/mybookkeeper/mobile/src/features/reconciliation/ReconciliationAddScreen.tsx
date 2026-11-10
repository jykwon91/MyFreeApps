import RequireWrite from "../workspace/RequireWrite";
import ReconciliationSkeleton from "./ReconciliationSkeleton";
import ReconciliationAddForm from "./ReconciliationAddForm";

export default function ReconciliationAddScreen({ year }: { year: number }) {
  return (
    <RequireWrite loading={<ReconciliationSkeleton />}>
      <ReconciliationAddForm year={year} />
    </RequireWrite>
  );
}
