import { ArrowLeftRight } from "lucide-react";
import { LoadingButton } from "@platform/ui";
import { PERSONAL_TRANSFER_LABELS as L } from "@mybookkeeper/api-client/constants/personalTransferLabels";

export interface PersonalTransferButtonProps {
  onMark: () => void;
  isMarking: boolean;
  disabled?: boolean;
}

/**
 * Payment Review's "this isn't rent, it's a friend paying me back".
 *
 * The card owns the mark (`usePersonalTransferActions`) so its other actions can
 * wait while one is in flight.
 */
export default function PersonalTransferButton({ onMark, isMarking, disabled = false }: PersonalTransferButtonProps) {
  return (
    <LoadingButton
      variant="secondary"
      size="sm"
      isLoading={isMarking}
      loadingText={L.markOnCardPending}
      onClick={onMark}
      disabled={disabled}
      title={L.markHelp}
    >
      <ArrowLeftRight className="h-4 w-4 mr-1" aria-hidden="true" />
      {L.markOnCard}
    </LoadingButton>
  );
}
