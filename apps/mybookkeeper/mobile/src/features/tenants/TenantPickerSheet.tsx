import { useGetTenantsQuery } from "@mybookkeeper/api-client/store/applicantsApi";
import { buildTenantOptions } from "@mybookkeeper/api-client/utils/tenantStatus";
import { OptionSheet } from "@platform/mobile";
import { TENANT_PICKER_LIMIT, TENANT_PICKER_MESSAGES as MESSAGES } from "../../constants/tenantPicker";
import { useTodayIso } from "../../lib/useTodayIso";

interface TenantPickerSheetProps {
  isOpen: boolean;
  description: string;
  onClose: () => void;
  onClosed: () => void;
  onPick: (tenant: { id: string; name: string }) => void;
}

export default function TenantPickerSheet({ isOpen, description, onClose, onClosed, onPick }: TenantPickerSheetProps) {
  const today = useTodayIso();
  // Ended tenants stay in the list: a final or late payment can arrive after move-out.
  const { currentData, error } = useGetTenantsQuery({ limit: TENANT_PICKER_LIMIT, include_ended: true, today });
  const tenants = currentData?.items ?? [];
  const options = buildTenantOptions(tenants, today).map((option) => ({ value: option.id, label: option.label }));

  return (
    <OptionSheet
      description={currentData?.has_more ? `${description} ${MESSAGES.more}` : description}
      emptyText={currentData ? MESSAGES.none : error ? MESSAGES.failed : MESSAGES.loading}
      isOpen={isOpen}
      onClose={onClose}
      onClosed={onClosed}
      onSelect={(id) => onPick({ id, name: tenants.find((tenant) => tenant.id === id)?.legal_name ?? MESSAGES.thisTenant })}
      options={options}
      title={MESSAGES.title}
      value={null}
    />
  );
}
