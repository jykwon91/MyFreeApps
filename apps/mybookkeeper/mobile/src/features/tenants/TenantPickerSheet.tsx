import { useGetTenantsQuery } from "@mybookkeeper/api-client/store/applicantsApi";
import { buildTenantOptions } from "@mybookkeeper/api-client/utils/tenantStatus";
import { OptionSheet } from "@platform/mobile";
import { router } from "expo-router";
import { TENANT_PICKER_LIMIT, TENANT_PICKER_MESSAGES as MESSAGES } from "../../constants/tenantPicker";
import { pickerLoadError } from "../../lib/pickerLoadError";
import type { TenantChoice } from "../../types/TenantChoice";
import { useTodayIso } from "../../lib/useTodayIso";
import SheetEmptyAction from "../shell/SheetEmptyAction";
import { useAfterSheetCloses } from "../shell/useAfterSheetCloses";

interface TenantPickerSheetProps {
  isOpen: boolean;
  description: string;
  onClose: () => void;
  onClosed: () => void;
  onPick: (tenant: TenantChoice) => void;
  /** The tenant already linked, shown as selected. */
  selectedId?: string | null;
}

export default function TenantPickerSheet({ isOpen, description, onClose, onClosed, onPick, selectedId = null }: TenantPickerSheetProps) {
  const today = useTodayIso();
  // Ended tenants stay in the list: a final or late payment can arrive after move-out.
  const { currentData, error, refetch } = useGetTenantsQuery({ limit: TENANT_PICKER_LIMIT, include_ended: true, today });
  const tenants = currentData?.items ?? [];
  const options = buildTenantOptions(tenants, today).map((option) => ({ value: option.id, label: option.label }));
  const { closeThen, handleClosed } = useAfterSheetCloses(onClose, onClosed);

  return (
    <OptionSheet
      description={currentData?.has_more ? `${description} ${MESSAGES.more}` : description}
      emptyContent={
        currentData ? (
          // Applicants is a tab, so this goes back to it rather than stacking a second copy of the tabs.
          <SheetEmptyAction actionLabel={MESSAGES.seeApplicants} message={MESSAGES.none} onPress={() => closeThen(() => router.navigate("/people?section=applicants"))} />
        ) : undefined
      }
      emptyText={MESSAGES.loading}
      isOpen={isOpen}
      loadError={pickerLoadError({ hasLoaded: currentData !== undefined, error, refetch }, MESSAGES.failed)}
      onClose={onClose}
      onClosed={handleClosed}
      onSelect={(id) => onPick({ id, name: tenants.find((tenant) => tenant.id === id)?.legal_name ?? MESSAGES.thisTenant })}
      options={options}
      title={MESSAGES.title}
      value={selectedId}
    />
  );
}
