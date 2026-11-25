import { Skeleton } from "@platform/ui";
import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";
import { LEASE_PROPERTY_MESSAGES } from "@/shared/lib/lease-property-messages";

export interface PropertySelectProps {
  id: string;
  value: string;
  onChange: (propertyId: string) => void;
  disabled?: boolean;
  testId: string;
  /** The `id` of the element that describes this field, e.g. a hint or an error. */
  describedBy?: string;
  isInvalid?: boolean;
  /** Show the skeleton while the caller still works out the starting value. */
  isLoading?: boolean;
}

/**
 * A dropdown of the owner's houses. Shows a skeleton the size of the dropdown while they load, and an
 * alert with Retry if they can't. A house no longer active is only listed when it is the current value,
 * so an old lease still shows the house it is filed under.
 */
export default function PropertySelect({ id, value, onChange, disabled, testId, describedBy, isInvalid, isLoading }: PropertySelectProps) {
  const { data: properties, error, isFetching, refetch } = useGetPropertiesQuery();

  if (isLoading || (properties === undefined && error === undefined)) {
    return <Skeleton className="h-11 w-full" testId={`${testId}-skeleton`} />;
  }
  if (properties === undefined) {
    return <LoadErrorAlert message={LEASE_PROPERTY_MESSAGES.loadFailed} isRetrying={isFetching} onRetry={() => void refetch()} />;
  }
  if (properties.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid={`${testId}-empty`}>
        {LEASE_PROPERTY_MESSAGES.noHouses}
      </p>
    );
  }

  const options = properties.filter((p) => p.is_active || p.id === value);
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      required
      aria-describedby={describedBy}
      aria-invalid={isInvalid || undefined}
      className="w-full px-3 py-2 text-sm border rounded-md min-h-[44px] bg-background"
      data-testid={testId}
    >
      <option value="">{LEASE_PROPERTY_MESSAGES.choose}</option>
      {options.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
