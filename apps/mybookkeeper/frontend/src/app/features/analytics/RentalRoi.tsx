import { useGetRentalRoiQuery } from "@mybookkeeper/api-client/store/analyticsApi";
import { RENTAL_ROI_TARGET_PARAM } from "@mybookkeeper/api-client/constants/rentalRoi";
import { parseTargetReturnPct } from "@mybookkeeper/api-client/utils/rentalRoi";
import { LoadingButton, useLiveSearchParams } from "@platform/ui";
import RentalRoiCards from "./RentalRoiCards";
import RentalRoiEmptyState from "./RentalRoiEmptyState";
import RentalRoiHeadline from "./RentalRoiHeadline";
import RentalRoiSkeleton from "./RentalRoiSkeleton";
import RentalRoiTable from "./RentalRoiTable";
import RentalRoiTargetInput from "./RentalRoiTargetInput";
import RentalRoiUnassignedNote from "./RentalRoiUnassignedNote";

export default function RentalRoi() {
  const [searchParams, setSearchParams] = useLiveSearchParams();
  const targetReturnPct = parseTargetReturnPct(searchParams.get(RENTAL_ROI_TARGET_PARAM));

  function handleTargetChange(pct: number) {
    setSearchParams(
      (prev) => {
        prev.set(RENTAL_ROI_TARGET_PARAM, String(pct));
        return prev;
      },
      { replace: true },
    );
  }

  // `data` keeps the last result while a new target loads, so a target change
  // shows the inline "Updating..." rather than the skeleton.
  const { data, error, isFetching, refetch } = useGetRentalRoiQuery({ targetReturnPct });

  // Decided on `error`, not `isError`: RTK clears `isError` while Retry refetches.
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
        <p className="text-muted-foreground">Couldn't load your rental numbers.</p>
        <LoadingButton type="button" isLoading={isFetching} loadingText="Retrying..." onClick={() => void refetch()}>
          Retry
        </LoadingButton>
      </div>
    );
  }

  if (!data) return <RentalRoiSkeleton />;

  if (data.properties.length === 0) {
    return (
      <RentalRoiEmptyState
        message="Add a property to see what it needs to earn each month."
        actionLabel="Add a property"
        to="/properties"
      />
    );
  }

  if (!data.has_transactions) {
    return (
      <RentalRoiEmptyState
        message="No approved transactions in the last 12 months yet."
        actionLabel="Go to Transactions"
        to="/transactions"
      />
    );
  }

  return (
    <div className="space-y-6">
      <RentalRoiHeadline summary={data.summary} />
      <div className="space-y-2">
        <RentalRoiTargetInput value={targetReturnPct} onChange={handleTargetChange} isUpdating={isFetching} />
        <p className="text-sm text-muted-foreground">Based on your last 12 months of approved transactions.</p>
      </div>
      <RentalRoiCards properties={data.properties} summary={data.summary} />
      <RentalRoiTable properties={data.properties} summary={data.summary} />
      {data.unassigned_revenue_monthly_cents > 0 && (
        <RentalRoiUnassignedNote cents={data.unassigned_revenue_monthly_cents} />
      )}
    </div>
  );
}
