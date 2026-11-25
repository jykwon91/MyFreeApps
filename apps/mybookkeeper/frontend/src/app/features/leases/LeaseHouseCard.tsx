import { useState } from "react";
import { Home } from "lucide-react";
import { AlertBox, LoadingButton, showError, showSuccess, Skeleton } from "@platform/ui";
import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { useUpdateSignedLeaseMutation } from "@mybookkeeper/api-client/store/signedLeasesApi";
import { isLeasePropertyNotFoundFailure } from "@mybookkeeper/api-client/utils/isLeasePropertyNotFoundFailure";
import PropertySelect from "@/app/features/properties/PropertySelect";
import { LEASE_PROPERTY_MESSAGES } from "@/shared/lib/lease-property-messages";

export interface LeaseHouseCardProps {
  leaseId: string;
  /** The house the lease records; null when it has none, which shows a warning. */
  propertyId: string | null;
  canWrite: boolean;
}

/**
 * The house a lease's rent is filed under, on the lease page. An owner or admin can change it at any
 * status; a lease with no house says so, because its rent then isn't filed under any house.
 */
export default function LeaseHouseCard({ leaseId, propertyId, canWrite }: LeaseHouseCardProps) {
  const { data: properties, isError } = useGetPropertiesQuery();
  const [updateLease, { isLoading: isSaving }] = useUpdateSignedLeaseMutation();
  const [draft, setDraft] = useState(propertyId ?? "");
  const houseName = properties?.find((p) => p.id === propertyId)?.name;
  const isChanged = draft !== "" && draft !== propertyId;

  async function handleSave(): Promise<void> {
    if (!isChanged) return;
    try {
      await updateLease({ leaseId, data: { property_id: draft } }).unwrap();
      showSuccess(LEASE_PROPERTY_MESSAGES.saved);
    } catch (error: unknown) {
      showError(isLeasePropertyNotFoundFailure(error) ? LEASE_PROPERTY_MESSAGES.propertyNotFound : LEASE_PROPERTY_MESSAGES.saveFailed);
    }
  }

  return (
    <section className="border rounded-lg p-4 space-y-3" data-testid="lease-house-card">
      <div className="flex items-center gap-3">
        <Home className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground uppercase font-medium tracking-wide">{LEASE_PROPERTY_MESSAGES.cardTitle}</p>
          {propertyId !== null && properties === undefined && !isError ? (
            <Skeleton className="h-5 w-40" testId="lease-house-name-skeleton" />
          ) : null}
          {houseName !== undefined ? (
            <p className="text-sm font-medium truncate" data-testid="lease-house-name">
              {houseName}
            </p>
          ) : null}
        </div>
      </div>

      {propertyId === null ? (
        <AlertBox variant="warning">
          <span role="status" data-testid="lease-house-missing-warning">
            {LEASE_PROPERTY_MESSAGES.missingWarning}
          </span>
        </AlertBox>
      ) : null}

      {canWrite ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="flex-1">
            <label htmlFor="lease-house-select" className="sr-only">
              {LEASE_PROPERTY_MESSAGES.label}
            </label>
            <PropertySelect id="lease-house-select" value={draft} onChange={setDraft} disabled={isSaving} testId="lease-house-select" />
          </div>
          <LoadingButton
            type="button"
            isLoading={isSaving}
            loadingText={LEASE_PROPERTY_MESSAGES.saving}
            disabled={!isChanged}
            onClick={() => void handleSave()}
            className="min-h-[44px]"
            data-testid="lease-house-save"
          >
            {LEASE_PROPERTY_MESSAGES.save}
          </LoadingButton>
        </div>
      ) : null}
    </section>
  );
}
