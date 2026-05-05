import { useState } from "react";
import { X } from "lucide-react";
import FormField from "@/shared/components/ui/FormField";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import Button from "@/shared/components/ui/Button";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { useCreateInsurancePolicyMutation } from "@/shared/store/insurancePoliciesApi";

export interface AddInsurancePolicyDialogProps {
  listingId: string;
  onClose: () => void;
}

/**
 * Modal dialog for creating a new insurance policy on a listing.
 */
export default function AddInsurancePolicyDialog({ listingId, onClose }: AddInsurancePolicyDialogProps) {
  const [createPolicy, { isLoading }] = useCreateInsurancePolicyMutation();

  const [policyName, setPolicyName] = useState("");
  const [carrier, setCarrier] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [coverageDollars, setCoverageDollars] = useState("");
  const [notes, setNotes] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!policyName.trim()) {
      showError("Policy name is required.");
      return;
    }

    const coverageCents =
      coverageDollars !== "" && coverageDollars !== "0"
        ? Math.round(parseFloat(coverageDollars) * 100)
        : null;

    try {
      await createPolicy({
        listing_id: listingId,
        policy_name: policyName.trim(),
        carrier: carrier.trim() || null,
        policy_number: policyNumber.trim() || null,
        effective_date: effectiveDate || null,
        expiration_date: expirationDate || null,
        coverage_amount_cents: coverageCents,
        notes: notes.trim() || null,
      }).unwrap();
      showSuccess("Insurance policy added.");
      onClose();
    } catch {
      showError("Couldn't save the policy. Please try again.");
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      data-testid="add-insurance-policy-dialog"
    >
      <div className="bg-background rounded-lg shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b">
          <h2 className="text-base font-semibold">Add insurance policy</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4">
          <FormField label="Policy name" required>
            <input
              type="text"
              value={policyName}
              onChange={(e) => setPolicyName(e.target.value)}
              placeholder="e.g. Landlord Insurance — 123 Main St"
              className="w-full px-3 py-2 text-sm border rounded-md"
              maxLength={255}
              required
              data-testid="insurance-policy-name-input"
            />
          </FormField>

          <FormField label="Carrier">
            <input
              type="text"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              placeholder="e.g. State Farm"
              className="w-full px-3 py-2 text-sm border rounded-md"
              maxLength={255}
              data-testid="insurance-carrier-input"
            />
          </FormField>

          <FormField label="Policy number">
            <input
              type="text"
              value={policyNumber}
              onChange={(e) => setPolicyNumber(e.target.value)}
              placeholder="e.g. POL-123456"
              className="w-full px-3 py-2 text-sm border rounded-md"
              maxLength={255}
              data-testid="insurance-policy-number-input"
            />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Effective date">
              <input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-md"
                data-testid="insurance-effective-date-input"
              />
            </FormField>

            <FormField label="Expiration date">
              <input
                type="date"
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-md"
                data-testid="insurance-expiration-date-input"
              />
            </FormField>
          </div>

          <FormField label="Coverage amount (USD)">
            <input
              type="number"
              value={coverageDollars}
              onChange={(e) => setCoverageDollars(e.target.value)}
              placeholder="e.g. 500000"
              min="0"
              step="1"
              className="w-full px-3 py-2 text-sm border rounded-md"
              data-testid="insurance-coverage-input"
            />
          </FormField>

          <FormField label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes about this policy..."
              className="w-full px-3 py-2 text-sm border rounded-md resize-none"
              rows={3}
              maxLength={5000}
              data-testid="insurance-notes-input"
            />
          </FormField>

          <div className="flex gap-3 pt-2 justify-end">
            <Button type="button" variant="secondary" size="md" onClick={onClose}>
              Cancel
            </Button>
            <LoadingButton
              type="submit"
              variant="primary"
              size="md"
              isLoading={isLoading}
              loadingText="Saving..."
              data-testid="insurance-policy-save-button"
            >
              Save policy
            </LoadingButton>
          </div>
        </form>
      </div>
    </div>
  );
}
