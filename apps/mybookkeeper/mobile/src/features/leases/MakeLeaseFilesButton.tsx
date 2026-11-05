import { useGenerateSignedLeaseMutation } from "@mybookkeeper/api-client/store/signedLeasesApi";
import type { SignedLeaseDetail } from "@mybookkeeper/api-client/types/lease/signed-lease-detail";
import { LoadingButton, useToast } from "@platform/mobile";
import { useRef } from "react";
import { MAKE_AND_EMAIL_BODY, makeAndEmailTitle, NEW_LEASE_MESSAGES as MESSAGES } from "../../constants/newLease";
import { httpStatus } from "../transactions/transactionMessages";
import { askOnce } from "./askOnce";
import { leaseEmailsOnGenerate } from "./leaseDisplay";

export default function MakeLeaseFilesButton({ lease }: { lease: SignedLeaseDetail }) {
  const { showToast } = useToast();
  const [generate, { isLoading }] = useGenerateSignedLeaseMutation();
  const asking = useRef(false);

  async function makeFiles(): Promise<void> {
    try {
      await generate(lease.id).unwrap();
      showToast(MESSAGES.madeFiles);
    } catch (error) {
      showToast(httpStatus(error) === 503 ? MESSAGES.storageDown : MESSAGES.makeFilesFailed, "error");
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
