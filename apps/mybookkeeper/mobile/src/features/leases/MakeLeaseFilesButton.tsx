import { useGenerateSignedLeaseMutation, useGetSignedLeaseByIdQuery } from "@mybookkeeper/api-client/store/signedLeasesApi";
import type { SignedLeaseDetail } from "@mybookkeeper/api-client/types/lease/signed-lease-detail";
import { LEASE_DOCUMENTS_LOCKED_MESSAGE } from "@mybookkeeper/api-client/constants/leaseDocumentsLocked";
import { isLeaseDocumentsLockedFailure } from "@mybookkeeper/api-client/utils/isLeaseDocumentsLockedFailure";
import { LoadingButton, useToast } from "@platform/mobile";
import { useRef } from "react";
import { MAKE_AND_EMAIL_BODY, makeAndEmailTitle, NEW_LEASE_MESSAGES as MESSAGES } from "../../constants/newLease";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { writeOutcome } from "@platform/core/utils/writeOutcome";
import { askOnce } from "../../lib/askOnce";
import { leaseEmailsOnGenerate } from "./leaseDisplay";
import { isCancelledRequest } from "@platform/core/utils/isCancelledRequest";

export default function MakeLeaseFilesButton({ lease }: { lease: SignedLeaseDetail }) {
  const { showToast } = useToast();
  const [generate, { isLoading }] = useGenerateSignedLeaseMutation();
  const { refetch } = useGetSignedLeaseByIdQuery(lease.id);
  const asking = useRef(false);

  async function makeFiles(): Promise<void> {
    try {
      await generate(lease.id).unwrap();
      showToast(MESSAGES.madeFiles);
    } catch (error) {
      if (isCancelledRequest(error)) return;
      if (isLeaseDocumentsLockedFailure(error)) {
        showToast(LEASE_DOCUMENTS_LOCKED_MESSAGE, "error");
        void refetch();
        return;
      }
      // A lost answer or a proxy error can come after the files were made, and making them again adds a second set (or emails the tenant twice).
      // The failed write reloads the lease, so its files are there to check.
      if (writeOutcome(error) === "unknown") showToast(MESSAGES.makeFilesUnsure, "error");
      else showToast(httpStatus(error) === 503 ? MESSAGES.storageDown : MESSAGES.makeFilesFailed, "error");
    }
  }

  function press(): void {
    if (leaseEmailsOnGenerate(lease)) {
      askOnce(asking, makeAndEmailTitle(lease.applicant_legal_name), MAKE_AND_EMAIL_BODY, { text: MESSAGES.makeAndEmail, onPress: () => void makeFiles() });
    } else {
      void makeFiles();
    }
  }

  return (
    <LoadingButton isLoading={isLoading} loadingText={MESSAGES.makingFiles} onPress={press}>
      {lease.status === "draft" ? MESSAGES.makeFiles : MESSAGES.remakeFiles}
    </LoadingButton>
  );
}
