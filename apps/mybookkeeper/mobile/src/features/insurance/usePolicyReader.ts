import {
  useExtractInsurancePolicyFromUploadMutation,
  useExtractInsurancePolicyMutation,
} from "@mybookkeeper/api-client/store/insurancePoliciesApi";
import type { InsurancePolicyDraft } from "@mybookkeeper/api-client/types/insurance/insurance-policy-draft";
import { useRef, useState } from "react";
import { filePart } from "../../lib/filePart";
import type { PolicyReadSource } from "../../types/PolicyReadSource";
import { policyReadFailure } from "./policyFailure";

/** One read at a time, so a second tap while the first is on its way can't pay for the document twice. */
export function usePolicyReader(onRead: (draft: InsurancePolicyDraft) => void) {
  const [extractDocument, { isLoading: isReadingDocument }] = useExtractInsurancePolicyMutation();
  const [extractUpload, { isLoading: isReadingUpload }] = useExtractInsurancePolicyFromUploadMutation();
  const [source, setSource] = useState<PolicyReadSource | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const isReadingNow = useRef(false);

  async function read(target: PolicyReadSource): Promise<void> {
    if (isReadingNow.current) return;
    isReadingNow.current = true;
    setSource(target);
    setFailure(null);
    try {
      if (target.kind === "file") {
        const form = new FormData();
        form.append("file", filePart(target.file));
        onRead(await extractUpload(form).unwrap());
      } else {
        onRead(await extractDocument({ document_id: target.id }).unwrap());
      }
    } catch (error) {
      setFailure(policyReadFailure(error));
    } finally {
      isReadingNow.current = false;
    }
  }

  return {
    source,
    failure,
    isReading: isReadingDocument || isReadingUpload,
    read,
    showFailure: setFailure,
    clear: () => {
      setSource(null);
      setFailure(null);
    },
  };
}
