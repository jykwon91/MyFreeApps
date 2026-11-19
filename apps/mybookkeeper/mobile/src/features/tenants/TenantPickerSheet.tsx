import { OptionSheet } from "@platform/mobile";
import { router } from "expo-router";
import { PICKER_LOAD_MESSAGES } from "../../constants/pickerLoad";
import { TENANT_PICKER_MESSAGES as MESSAGES } from "../../constants/tenantPicker";
import { pickerLoadError } from "../../lib/pickerLoadError";
import type { TenantChoice } from "../../types/TenantChoice";
import { useTodayIso } from "../../lib/useTodayIso";
import PagedChoicesFooter from "../shell/PagedChoicesFooter";
import SheetEmptyAction from "../shell/SheetEmptyAction";
import { useAfterSheetCloses } from "../shell/useAfterSheetCloses";
import { useTenantChoices } from "./useTenantChoices";

interface TenantPickerSheetProps {
  isOpen: boolean;
  description: string;
  onClose: () => void;
  onClosed: () => void;
  onPick: (tenant: TenantChoice) => void;
  /** The tenant already linked, shown as selected. */
  selectedId?: string | null;
}

/** Every tenant, more loading as the list nears its end. Whoever opens it shows the linked tenant's name itself. */
export default function TenantPickerSheet({ isOpen, description, onClose, onClosed, onPick, selectedId = null }: TenantPickerSheetProps) {
  const today = useTodayIso();
  const choices = useTenantChoices(today);
  const { tenants, hasData, error, refetch } = choices;
  const { closeThen, handleClosed } = useAfterSheetCloses(onClose, onClosed);

  return (
    <OptionSheet
      description={description}
      emptyContent={
        hasData ? (
          // Applicants is a tab, so this goes back to it rather than stacking a second copy of the tabs.
          <SheetEmptyAction actionLabel={MESSAGES.seeApplicants} message={MESSAGES.none} onPress={() => closeThen(() => router.navigate("/people?section=applicants"))} />
        ) : undefined
      }
      emptyText={MESSAGES.loading}
      footer={<PagedChoicesFooter choices={choices} loadingLabel={PICKER_LOAD_MESSAGES.loadingMoreTenants} />}
      isOpen={isOpen}
      loadError={pickerLoadError({ hasLoaded: hasData, error, refetch }, MESSAGES.failed)}
      onClose={onClose}
      onClosed={handleClosed}
      onEndReached={choices.loadMoreIfAny}
      onSelect={(id) => onPick({ id, name: tenants.find((tenant) => tenant.id === id)?.legal_name ?? MESSAGES.thisTenant })}
      options={choices.options}
      title={MESSAGES.title}
      value={selectedId}
    />
  );
}
