import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { OptionSheet } from "@platform/mobile";
import { PAYMENT_REVIEW_MESSAGES as MESSAGES } from "../../constants/paymentReview";
import { selectableProperties } from "../transactions/transactionEditValues";

interface PaymentReviewPropertySheetProps {
  isOpen: boolean;
  description: string;
  onClose: () => void;
  onClosed: () => void;
  onPick: (property: { id: string; name: string }) => void;
}

export default function PaymentReviewPropertySheet({ isOpen, description, onClose, onClosed, onPick }: PaymentReviewPropertySheetProps) {
  const { currentData, error } = useGetPropertiesQuery();
  const properties = selectableProperties(currentData ?? [], null);

  return (
    <OptionSheet
      description={description}
      emptyText={currentData ? MESSAGES.noProperties : error ? MESSAGES.propertiesFailed : MESSAGES.propertiesLoading}
      isOpen={isOpen}
      onClose={onClose}
      onClosed={onClosed}
      onSelect={(id) => onPick({ id, name: properties.find((property) => property.id === id)?.name ?? MESSAGES.thisProperty })}
      options={properties.map((property) => ({ value: property.id, label: property.name }))}
      title={MESSAGES.propertySheetTitle}
      value={null}
    />
  );
}
