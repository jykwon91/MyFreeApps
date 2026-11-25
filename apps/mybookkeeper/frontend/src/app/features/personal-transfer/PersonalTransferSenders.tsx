import { useState } from "react";
import { ConfirmDialog, showError, showSuccess } from "@platform/ui";
import Card from "@/shared/components/ui/Card";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";
import { useCanWrite } from "@/shared/hooks/useOrgRole";
import {
  PERSONAL_TRANSFER_LABELS as L,
  PERSONAL_TRANSFER_SENDERS_COLLAPSED,
} from "@mybookkeeper/api-client/constants/personalTransferLabels";
import {
  useForgetPersonalTransferSenderMutation,
  useGetPersonalTransferSendersQuery,
} from "@mybookkeeper/api-client/store/personalTransferApi";
import type { PersonalTransferSender } from "@mybookkeeper/api-client/types/personal-transfer/personal-transfer-sender";
import { personalSenderForgottenMessage } from "@mybookkeeper/api-client/utils/personalTransferMessages";
import PersonalTransferSenderRow from "./PersonalTransferSenderRow";
import PersonalTransferSendersSkeleton from "./PersonalTransferSendersSkeleton";

/** The senders Payment Review skips, each with a way to stop skipping them. */
export default function PersonalTransferSenders() {
  const canWrite = useCanWrite();
  const { data, isLoading, isFetching, refetch } = useGetPersonalTransferSendersQuery();
  const [forgetSender, { isLoading: isForgetting }] = useForgetPersonalTransferSenderMutation();
  const [confirming, setConfirming] = useState<PersonalTransferSender | null>(null);
  const [showAll, setShowAll] = useState(false);

  async function handleConfirmForget() {
    if (!confirming) return;
    try {
      await forgetSender(confirming.id).unwrap();
      showSuccess(personalSenderForgottenMessage(confirming));
      setConfirming(null);
    } catch {
      showError(L.forgetFailed);
    }
  }

  const senders = data ?? [];
  const visible = showAll ? senders : senders.slice(0, PERSONAL_TRANSFER_SENDERS_COLLAPSED);
  const hasMore = senders.length > PERSONAL_TRANSFER_SENDERS_COLLAPSED;

  return (
    <section aria-labelledby="personal-transfer-senders-heading" className="space-y-2">
      <div>
        <h2 id="personal-transfer-senders-heading" className="text-lg font-semibold">{L.sendersHeading}</h2>
        <p className="text-sm text-muted-foreground">{L.sendersHelp}</p>
      </div>
      <Card>
        {isLoading && <PersonalTransferSendersSkeleton />}
        {!isLoading && !data && (
          <LoadErrorAlert message={L.sendersLoadError} isRetrying={isFetching} onRetry={() => void refetch()} />
        )}
        {data && senders.length === 0 && <p className="text-sm text-muted-foreground py-2">{L.sendersEmpty}</p>}
        {senders.length > 0 && (
          <ul className="divide-y">
            {visible.map((sender) => (
              <PersonalTransferSenderRow
                key={sender.id}
                sender={sender}
                canWrite={canWrite}
                isForgetting={isForgetting && confirming?.id === sender.id}
                onForget={setConfirming}
              />
            ))}
          </ul>
        )}
        {hasMore && (
          <button
            type="button"
            className="text-sm text-primary hover:underline min-h-[44px]"
            onClick={() => setShowAll((value) => !value)}
          >
            {showAll ? L.sendersShowFewer : L.sendersShowAll(senders.length)}
          </button>
        )}
      </Card>
      <ConfirmDialog
        open={confirming !== null}
        title={confirming ? L.forgetConfirmTitle(confirming.display_name) : ""}
        description={confirming ? L.forgetConfirmBody(confirming.display_name) : ""}
        confirmLabel={L.forget}
        cancelLabel="Cancel"
        isLoading={isForgetting}
        onConfirm={() => void handleConfirmForget()}
        onCancel={() => setConfirming(null)}
      />
    </section>
  );
}
