import { useState } from "react";
import { CheckCircle, XCircle, HelpCircle, UserCheck, Home } from "lucide-react";
import { LoadingButton } from "@platform/ui";
import { formatCurrency } from "@/shared/utils/currency";
import type { AttributionReviewItem as ReviewItemType } from "@/shared/types/attribution/attribution-review";
import {
  useConfirmAttributionReviewMutation,
  useRejectAttributionReviewMutation,
  useAttributeTransactionManuallyMutation,
} from "@/shared/store/attributionApi";
import { useGetTenantsQuery } from "@/shared/store/applicantsApi";
import { useGetPropertiesQuery } from "@/shared/store/propertiesApi";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import AttributionChannelBadge from "./AttributionChannelBadge";

export interface AttributionReviewItemProps {
  item: ReviewItemType;
}

// A long property name in the "Assign to <name>" button would blow out the
// action column on narrow screens — truncate to keep the button compact.
const MAX_PROPERTY_NAME_LEN = 22;

function truncateName(value: string): string {
  // Slice by code point, not UTF-16 code unit, so a name ending in an emoji
  // / astral char isn't cut mid-surrogate (renders as �).
  const chars = Array.from(value);
  return chars.length > MAX_PROPERTY_NAME_LEN
    ? `${chars.slice(0, MAX_PROPERTY_NAME_LEN - 1).join("")}…`
    : value;
}

function rejectLabelFor(isPropertyRow: boolean, isUnmatched: boolean): string {
  if (!isPropertyRow) return "Not them";
  return isUnmatched ? "Skip" : "Not this property";
}

export default function AttributionReviewItem({ item }: AttributionReviewItemProps) {
  const [confirmReview, { isLoading: isConfirming }] = useConfirmAttributionReviewMutation();
  const [rejectReview, { isLoading: isRejecting }] = useRejectAttributionReviewMutation();
  const [attributeManually, { isLoading: isAttributing }] = useAttributeTransactionManuallyMutation();
  const [isActing, setIsActing] = useState(false);
  const [pickedApplicantId, setPickedApplicantId] = useState<string>("");
  const [pickedPropertyId, setPickedPropertyId] = useState<string>("");

  const txn = item.transaction;
  const isUnmatched = item.confidence === "unmatched";

  // Discriminator: an Airbnb/OTA payout (channel set, not a direct booking)
  // belongs to a *property/listing*, not a tenant. A rent payment has no
  // channel and is applicant-shaped. Drives which of the 4 row shapes renders.
  const channel = txn?.channel ?? null;
  const isPropertyRow = channel !== null && channel !== "direct";
  const badgeChannel = isPropertyRow ? channel : null;

  // Tenant list only for rent rows that are unmatched — never for property
  // rows, otherwise this mounts on every Airbnb row and burns RTK cache.
  // Uses the dedicated /applicants/tenants endpoint (NOT the generic
  // /applicants, whose limit caps at 100 — requesting `limit: 200` there
  // returned 422 and stranded this picker in its error state).
  const {
    data: tenantsResponse,
    isLoading: loadingApplicants,
    isError: applicantsError,
    isUninitialized: applicantsUninitialized,
  } = useGetTenantsQuery(
    { limit: 100 },
    { skip: !isUnmatched || isPropertyRow },
  );
  const applicants = tenantsResponse?.items ?? [];

  // Property list only for property rows that are unmatched (no proposal to
  // confirm — the host picks the listing the payout belongs to).
  const {
    data: properties = [],
    isLoading: loadingProperties,
    isError: propertiesError,
    isUninitialized: propertiesUninitialized,
  } = useGetPropertiesQuery(undefined, { skip: !isUnmatched || !isPropertyRow });
  // Only active properties are valid payout targets — attributing revenue to
  // an archived/inactive listing would silently skew that property's P&L.
  const activeProperties = properties.filter((p) => p.is_active);

  const handleConfirm = async () => {
    setIsActing(true);
    try {
      await confirmReview({ review_id: item.id }).unwrap();
      showSuccess("Payment attributed — nice, I'll remember that.");
    } catch {
      showError("Couldn't confirm that. Try again?");
    } finally {
      setIsActing(false);
    }
  };

  const handleConfirmProperty = async (propertyId: string) => {
    if (!propertyId) return;
    setIsActing(true);
    try {
      await confirmReview({ review_id: item.id, property_id: propertyId }).unwrap();
      showSuccess("Got it — I'll book this payout to that property from now on.");
    } catch {
      showError("Couldn't assign that payout. Try again?");
    } finally {
      setIsActing(false);
    }
  };

  const handleReject = async () => {
    setIsActing(true);
    try {
      await rejectReview({ review_id: item.id }).unwrap();
      showSuccess("Got it — skipped.");
    } catch {
      showError("Couldn't skip that. Try again?");
    } finally {
      setIsActing(false);
    }
  };

  const handleLink = async () => {
    if (!pickedApplicantId || !txn) return;
    setIsActing(true);
    try {
      // Service also resolves the review-queue row, so no separate reject
      // call is needed.
      await attributeManually({
        transaction_id: txn.id,
        applicant_id: pickedApplicantId,
      }).unwrap();
      showSuccess("Payment linked to tenant.");
    } catch {
      showError("Couldn't link that payment. Try again?");
    } finally {
      setIsActing(false);
    }
  };

  const proposedApplicant = item.proposed_applicant;
  const proposedProperty = item.proposed_property;
  const displayName = txn?.payer_name ?? txn?.vendor ?? "Unknown sender";
  const amount = txn ? formatCurrency(parseFloat(txn.amount)) : "—";
  const txnDate = txn?.transaction_date
    ? new Date(txn.transaction_date).toLocaleDateString()
    : "—";

  const anyLoading = (isConfirming || isRejecting || isAttributing) && isActing;
  const rejectLabel = rejectLabelFor(isPropertyRow, isUnmatched);

  // ---- Row-shape resolution (mutually exclusive) ------------------------
  const isFuzzyApplicant =
    !isPropertyRow && item.confidence === "fuzzy" && proposedApplicant != null;
  // Pipeline invariant (PR C): a fuzzy property row always carries a
  // proposed_property_id, so `isPropertyRow && fuzzy && proposedProperty == null`
  // is unreachable from real data — it renders the unmatched cue + reject only.
  const isFuzzyProperty =
    isPropertyRow && item.confidence === "fuzzy" && proposedProperty != null;
  const showTenantPicker = !isPropertyRow && isUnmatched && txn != null;
  const showPropertyPicker = isPropertyRow && isUnmatched && txn != null;

  // Property-picker sub-states. `propsLoading` also covers the pre-fetch tick
  // (isUninitialized) so the empty state never flashes before the request
  // starts (no layout shift). Empty/ready key off the active-only list.
  const propsLoading =
    showPropertyPicker && (loadingProperties || propertiesUninitialized);
  const propsErrored = showPropertyPicker && !propsLoading && propertiesError;
  const propsEmpty =
    showPropertyPicker && !propsLoading && !propertiesError && activeProperties.length === 0;
  const propsReady =
    showPropertyPicker && !propsLoading && !propertiesError && activeProperties.length > 0;

  // Tenant-picker sub-states, mirroring the property machine above.
  // `tenantsLoading` also covers the pre-fetch tick (the query is skipped
  // until this is a rent row, so it starts uninitialized). `tenantsEmpty`
  // gives the host an explanation + next step when there are no lease_signed
  // tenants yet, instead of silently leaving only "Not them".
  const tenantsLoading =
    showTenantPicker && (loadingApplicants || applicantsUninitialized);
  const tenantsErrored = showTenantPicker && !tenantsLoading && applicantsError;
  const tenantsEmpty =
    showTenantPicker && !tenantsLoading && !applicantsError && applicants.length === 0;
  const tenantsReady =
    showTenantPicker && !tenantsLoading && !applicantsError && applicants.length > 0;

  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-4 p-4 border rounded-lg bg-card">
      <div className="flex-1 space-y-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {badgeChannel && <AttributionChannelBadge channel={badgeChannel} />}
          <span className="font-medium truncate">{displayName}</span>
          <span className="text-sm text-green-600 font-semibold">{amount}</span>
          <span className="text-xs text-muted-foreground">{txnDate}</span>
        </div>
        {txn?.description && (
          <p className="text-sm text-muted-foreground truncate">{txn.description}</p>
        )}

        {isFuzzyApplicant && (
          <div className="flex items-center gap-1.5 text-sm">
            <HelpCircle className="h-4 w-4 text-amber-500 shrink-0" aria-hidden="true" />
            <span>
              Looks like <strong>{proposedApplicant?.legal_name ?? "Unknown"}</strong>?
            </span>
          </div>
        )}
        {!isPropertyRow && !isFuzzyApplicant && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <HelpCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Couldn't match this to any of your tenants.</span>
          </div>
        )}
        {isFuzzyProperty && (
          <div className="flex items-center gap-1.5 text-sm">
            <HelpCircle className="h-4 w-4 text-amber-500 shrink-0" aria-hidden="true" />
            <span>
              Looks like a payout for <strong>{proposedProperty?.name}</strong> — that right?
            </span>
          </div>
        )}
        {isPropertyRow && !isFuzzyProperty && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <HelpCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Couldn't figure out which property this payout belongs to.</span>
          </div>
        )}

        {tenantsLoading && (
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <div
              className="border rounded px-2 py-1.5 text-sm bg-background min-h-[36px] max-w-[220px] flex items-center text-muted-foreground"
              aria-hidden="true"
            >
              Loading tenants…
            </div>
            <LoadingButton
              variant="primary"
              size="sm"
              isLoading={false}
              onClick={() => {}}
              disabled
            >
              <UserCheck className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              Link
            </LoadingButton>
          </div>
        )}
        {tenantsErrored && (
          <p className="text-sm text-destructive pt-1">
            Couldn't load tenants — try refreshing.
          </p>
        )}
        {tenantsEmpty && (
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <p className="text-sm text-muted-foreground">
              No tenants with a signed lease yet — add one in Applicants.
            </p>
            <LoadingButton
              variant="primary"
              size="sm"
              isLoading={false}
              onClick={() => {}}
              disabled
            >
              <UserCheck className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              Link
            </LoadingButton>
          </div>
        )}
        {tenantsReady && (
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <select
              value={pickedApplicantId}
              onChange={(e) => setPickedApplicantId(e.target.value)}
              className="border rounded px-2 py-1.5 text-sm bg-background min-h-[36px] max-w-[220px]"
              aria-label="Pick a tenant for this payment"
              disabled={anyLoading}
            >
              <option value="">— pick a tenant —</option>
              {applicants.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.legal_name ?? "Unnamed"}
                </option>
              ))}
            </select>
            <LoadingButton
              variant="primary"
              size="sm"
              isLoading={isAttributing && isActing}
              loadingText="Linking..."
              onClick={handleLink}
              disabled={!pickedApplicantId || anyLoading}
            >
              <UserCheck className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              Link
            </LoadingButton>
          </div>
        )}

        {propsLoading && (
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <div
              className="border rounded px-2 py-1.5 text-sm bg-background min-h-[36px] max-w-[220px] flex items-center text-muted-foreground"
              aria-hidden="true"
            >
              Loading properties…
            </div>
            <LoadingButton
              variant="primary"
              size="sm"
              isLoading={false}
              onClick={() => {}}
              disabled
            >
              <Home className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              Assign
            </LoadingButton>
          </div>
        )}
        {propsErrored && (
          <p className="text-sm text-destructive pt-1">
            Couldn't load properties — try refreshing.
          </p>
        )}
        {propsEmpty && (
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <p className="text-sm text-muted-foreground">
              No properties set up yet — add one in Settings.
            </p>
            <LoadingButton
              variant="primary"
              size="sm"
              isLoading={false}
              onClick={() => {}}
              disabled
            >
              <Home className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              Assign
            </LoadingButton>
          </div>
        )}
        {propsReady && (
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <select
              value={pickedPropertyId}
              onChange={(e) => setPickedPropertyId(e.target.value)}
              className="border rounded px-2 py-1.5 text-sm bg-background min-h-[36px] max-w-[220px]"
              aria-label="Pick a property for this payout"
              disabled={anyLoading}
            >
              <option value="">— pick a property —</option>
              {activeProperties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <LoadingButton
              variant="primary"
              size="sm"
              isLoading={isConfirming && isActing}
              loadingText="Assigning..."
              onClick={() => handleConfirmProperty(pickedPropertyId)}
              disabled={!pickedPropertyId || anyLoading}
            >
              <Home className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              Assign
            </LoadingButton>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {isFuzzyApplicant && (
          <LoadingButton
            variant="primary"
            size="sm"
            isLoading={isConfirming && isActing}
            loadingText="Saving..."
            onClick={handleConfirm}
            disabled={(isRejecting || isAttributing) && isActing}
          >
            <CheckCircle className="h-4 w-4 mr-1" aria-hidden="true" />
            Yes, that's them
          </LoadingButton>
        )}
        {isFuzzyProperty && proposedProperty && (
          <LoadingButton
            variant="primary"
            size="sm"
            isLoading={isConfirming && isActing}
            loadingText="Assigning..."
            onClick={() => handleConfirmProperty(proposedProperty.id)}
            disabled={(isRejecting || isAttributing) && isActing}
          >
            <Home className="h-4 w-4 mr-1" aria-hidden="true" />
            Assign to {truncateName(proposedProperty.name)}
          </LoadingButton>
        )}
        <LoadingButton
          variant="secondary"
          size="sm"
          isLoading={isRejecting && isActing}
          loadingText="Skipping..."
          onClick={handleReject}
          disabled={(isConfirming || isAttributing) && isActing}
        >
          <XCircle className="h-4 w-4 mr-1" aria-hidden="true" />
          {rejectLabel}
        </LoadingButton>
      </div>
    </div>
  );
}
