import type { Document } from "@mybookkeeper/api-client/types/document/document";
import { failedDocumentsMessage } from "@mybookkeeper/api-client/utils/failedDocumentsMessage";
import { Banner } from "@platform/mobile";
import { DOCUMENT_LIST_MESSAGES } from "../../constants/documents";
import { documentName } from "./documentDisplay";

/** What the website says above its table when something failed to read. */
export default function FailedDocumentsNotice({
  failed,
  onShow,
  onDismiss,
}: {
  failed: readonly Document[];
  onShow: () => void;
  onDismiss: () => void;
}) {
  if (failed.length === 0) return null;
  return (
    <Banner
      actions={[
        { label: DOCUMENT_LIST_MESSAGES.showFailed, onPress: onShow },
        { label: DOCUMENT_LIST_MESSAGES.dismiss, onPress: onDismiss },
      ]}
      message={failedDocumentsMessage(failed.length, documentName(failed[0]))}
    />
  );
}
