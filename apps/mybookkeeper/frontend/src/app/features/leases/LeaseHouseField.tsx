import PropertySelect from "@/app/features/properties/PropertySelect";
import { LEASE_PROPERTY_MESSAGES } from "@/shared/lib/lease-property-messages";

export interface LeaseHouseFieldProps {
  id: string;
  value: string;
  onChange: (propertyId: string) => void;
  /** The value came from the applicant's inquiry listing, not from the host. */
  isPrefilled: boolean;
  /** Shown in place of the hint once the host has tried to go on without a house. */
  error?: string;
  disabled?: boolean;
  /** The starting house is still being looked up. */
  isLoading?: boolean;
  testId: string;
}

/** The required "which house is this lease for?" field on the new-lease page and the import dialog. */
export default function LeaseHouseField({ id, value, onChange, isPrefilled, error, disabled, isLoading, testId }: LeaseHouseFieldProps) {
  const noteId = `${id}-note`;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {LEASE_PROPERTY_MESSAGES.label} <span className="text-destructive">*</span>
      </label>
      <PropertySelect
        id={id}
        value={value}
        onChange={onChange}
        disabled={disabled}
        testId={testId}
        describedBy={noteId}
        isInvalid={Boolean(error)}
        isLoading={isLoading}
      />
      {error ? (
        <p id={noteId} className="text-xs text-destructive" role="alert" data-testid={`${testId}-error`}>
          {error}
        </p>
      ) : (
        <p id={noteId} className="text-xs text-muted-foreground" data-testid={`${testId}-hint`}>
          {isPrefilled ? LEASE_PROPERTY_MESSAGES.prefilledHint : LEASE_PROPERTY_MESSAGES.hint}
        </p>
      )}
    </div>
  );
}
