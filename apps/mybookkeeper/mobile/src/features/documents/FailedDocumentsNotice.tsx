import type { FailedDocuments } from "@mybookkeeper/api-client/types/document/FailedDocuments";
import { failedDocumentsMessage } from "@mybookkeeper/api-client/utils/failedDocumentsMessage";
import { Banner } from "@platform/mobile";
import { DOCUMENT_LIST_MESSAGES } from "../../constants/documents";
import { documentName } from "./documentDisplay";

/** What the website says above its table when something failed to read: every failed one, counted by the server. */
export default function FailedDocumentsNotice({
  failed,
  onShow,
  onDismiss,
}: {
  failed: FailedDocuments;
  onShow: () => void;
  onDismiss: () => void;
}) {
  if (failed.count === 0 || !failed.newest) return null;
  return (
    <Banner
      actions={[
        { label: DOCUMENT_LIST_MESSAGES.showFailed, onPress: onShow },
        { label: DOCUMENT_LIST_MESSAGES.dismiss, onPress: onDismiss },
      ]}
      message={failedDocumentsMessage(failed.count, documentName(failed.newest))}
    />
  );
}
