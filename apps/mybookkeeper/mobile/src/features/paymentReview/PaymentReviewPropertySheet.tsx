import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { OptionSheet } from "@platform/mobile";
import { router } from "expo-router";
import { PAYMENT_REVIEW_MESSAGES as MESSAGES } from "../../constants/paymentReview";
import { PICKER_LOAD_MESSAGES } from "../../constants/pickerLoad";
import { pickerLoadError } from "../../lib/pickerLoadError";
import SheetEmptyAction from "../shell/SheetEmptyAction";
import { useAfterSheetCloses } from "../shell/useAfterSheetCloses";
import { selectableProperties } from "../transactions/transactionEditValues";

interface PaymentReviewPropertySheetProps {
  isOpen: boolean;
  description: string;
  onClose: () => void;
  onClosed: () => void;
  onPick: (property: { id: string; name: string }) => void;
}

export default function PaymentReviewPropertySheet({ isOpen, description, onClose, onClosed, onPick }: PaymentReviewPropertySheetProps) {
  const { currentData, error, refetch } = useGetPropertiesQuery();
  const properties = selectableProperties(currentData ?? [], null);
  const { closeThen, handleClosed } = useAfterSheetCloses(onClose, onClosed);

  return (
    <OptionSheet
      description={description}
      emptyContent={
        currentData ? (
          <SheetEmptyAction actionLabel={MESSAGES.addProperty} message={MESSAGES.noProperties} onPress={() => closeThen(() => router.push("/properties/new"))} />
        ) : undefined
      }
      emptyText={PICKER_LOAD_MESSAGES.propertiesLoading}
      isOpen={isOpen}
      loadError={pickerLoadError({ hasLoaded: currentData !== undefined, error, refetch }, PICKER_LOAD_MESSAGES.propertiesFailed)}
      onClose={onClose}
      onClosed={handleClosed}
      onSelect={(id) => onPick({ id, name: properties.find((property) => property.id === id)?.name ?? MESSAGES.thisProperty })}
      options={properties.map((property) => ({ value: property.id, label: property.name }))}
      title={MESSAGES.propertySheetTitle}
      value={null}
    />
  );
}
