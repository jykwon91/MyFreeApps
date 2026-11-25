import { UserX } from "lucide-react";
import { LoadingButton } from "@platform/ui";
import type { PersonalTransferSender } from "@mybookkeeper/api-client/types/personal-transfer/personal-transfer-sender";
import { PERSONAL_TRANSFER_LABELS as L } from "@mybookkeeper/api-client/constants/personalTransferLabels";

export interface PersonalTransferSenderRowProps {
  sender: PersonalTransferSender;
  isForgetting: boolean;
  canWrite: boolean;
  onForget: (sender: PersonalTransferSender) => void;
}

export default function PersonalTransferSenderRow({ sender, isForgetting, canWrite, onForget }: PersonalTransferSenderRowProps) {
  return (
    <li data-testid="personal-transfer-sender" className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{sender.display_name}</p>
        {sender.payer_handle && <p className="text-xs text-muted-foreground truncate">{sender.payer_handle}</p>}
      </div>
      {canWrite && (
        <LoadingButton
          variant="ghost"
          size="sm"
          isLoading={isForgetting}
          loadingText="Removing..."
          onClick={() => onForget(sender)}
          aria-label={L.forgetAria(sender.display_name)}
        >
          <UserX className="h-4 w-4 mr-1" aria-hidden="true" />
          {L.forget}
        </LoadingButton>
      )}
    </li>
  );
}
