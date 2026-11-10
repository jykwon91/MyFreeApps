/**
 * useApplicationSave — the Add application dialog's save: the company to save
 * under (adding one whose auto-add failed), then POST /applications.
 *
 * One save at a time: a ref stops a second submit in the same tick (a fast
 * double-click), and `creatingApplication` drives the Save button for the
 * whole save, company included. A save whose run has gone stale (the dialog
 * was closed, maybe reopened) still says it saved, but neither closes nor
 * resets the dialog now showing, nor clears that dialog's own save.
 */
import { useRef, useState } from "react";
import { showError, showSuccess, extractErrorMessage } from "@platform/ui";
import { useCreateApplicationMutation } from "@myjobhunter/api-client/store/applicationsApi";
import type { AddApplicationFormValues } from "@myjobhunter/api-client/types/application/add-application-form-values";
import type { CompanyResolver, IsCurrent } from "@myjobhunter/api-client/types/application/company-resolver";
import type { ReviewCompanyState } from "@myjobhunter/api-client/types/application/review-company-state";
import { buildApplicationCreateRequest } from "@myjobhunter/api-client/utils/buildApplicationCreateRequest";
import { ADD_APPLICATION_MESSAGES as MESSAGES } from "@/constants/add-application-messages";

export interface ApplicationSaveInput {
  company: ReviewCompanyState;
  sourceUrl: string | null;
  jdText: string;
  values: AddApplicationFormValues;
}

interface UseApplicationSaveReturn {
  creatingApplication: boolean;
  save: (input: ApplicationSaveInput, isCurrent: IsCurrent, onSuccess: () => void) => Promise<void>;
  /** Forgets a save in flight, for a dialog that has been reset. */
  resetSave: () => void;
}

export function useApplicationSave(
  companyIdForSave: CompanyResolver["companyIdForSave"],
): UseApplicationSaveReturn {
  const [createApplication] = useCreateApplicationMutation();
  const isSavingRef = useRef(false);
  const [creatingApplication, setCreatingApplication] = useState(false);

  function resetSave(): void {
    isSavingRef.current = false;
    setCreatingApplication(false);
  }

  async function save(
    input: ApplicationSaveInput,
    isCurrent: IsCurrent,
    onSuccess: () => void,
  ): Promise<void> {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setCreatingApplication(true);
    try {
      await saveOnce(input, isCurrent, onSuccess);
    } finally {
      if (isCurrent()) resetSave();
    }
  }

  async function saveOnce(
    { company, sourceUrl, jdText, values }: ApplicationSaveInput,
    isCurrent: IsCurrent,
    onSuccess: () => void,
  ): Promise<void> {
    let companyId: string | null;
    try {
      companyId = await companyIdForSave(company, isCurrent);
    } catch (err) {
      if (isCurrent()) {
        showError(`Couldn't auto-create company "${company.name}": ${extractErrorMessage(err)}`);
      }
      return;
    }
    if (!isCurrent()) return;
    if (!companyId) {
      showError("Pick a company before saving the application.");
      return;
    }
    try {
      await createApplication(
        buildApplicationCreateRequest(values, { companyId, sourceUrl, jdText }),
      ).unwrap();
    } catch (err) {
      if (isCurrent()) showError(`Couldn't create application: ${extractErrorMessage(err)}`);
      return;
    }
    showSuccess(MESSAGES.added);
    if (isCurrent()) onSuccess();
  }

  return { creatingApplication, save, resetSave };
}
