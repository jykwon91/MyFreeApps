import { useGetTenantsQuery } from "@mybookkeeper/api-client/store/applicantsApi";
import { buildTenantOptions } from "@mybookkeeper/api-client/utils/tenantStatus";
import { OptionSheet } from "@platform/mobile";
import { PAYMENT_REVIEW_MESSAGES as MESSAGES, TENANT_PICKER_LIMIT } from "../../constants/paymentReview";
import { useTodayIso } from "../../lib/useTodayIso";

interface PaymentReviewTenantSheetProps {
  isOpen: boolean;
  description: string;
  onClose: () => void;
  onClosed: () => void;
  onPick: (tenant: { id: string; name: string }) => void;
}

export default function PaymentReviewTenantSheet({ isOpen, description, onClose, onClosed, onPick }: PaymentReviewTenantSheetProps) {
  const today = useTodayIso();
  // Ended tenants stay in the list: a final or late payment can arrive after move-out.
  const { currentData, error } = useGetTenantsQuery({ limit: TENANT_PICKER_LIMIT, include_ended: true });
  const tenants = currentData?.items ?? [];
  const options = buildTenantOptions(tenants, today).map((option) => ({ value: option.id, label: option.label }));

  return (
    <OptionSheet
      description={currentData?.has_more ? `${description} ${MESSAGES.moreTenants}` : description}
      emptyText={currentData ? MESSAGES.noTenants : error ? MESSAGES.tenantsFailed : MESSAGES.tenantsLoading}
      isOpen={isOpen}
      onClose={onClose}
      onClosed={onClosed}
      onSelect={(id) => onPick({ id, name: tenants.find((tenant) => tenant.id === id)?.legal_name ?? MESSAGES.thisTenant })}
      options={options}
      title={MESSAGES.tenantSheetTitle}
      value={null}
    />
  );
}
