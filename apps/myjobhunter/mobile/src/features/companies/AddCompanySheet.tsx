import { COMPANY_FORM_PROBLEMS } from "@myjobhunter/api-client/constants/companyFormProblems";
import { EMPTY_COMPANY_FORM_VALUES } from "@myjobhunter/api-client/constants/emptyCompanyFormValues";
import { LOST_CREATE_CHECK_WHERE } from "@myjobhunter/api-client/constants/lostCreateCheckWhere";
import { useCompanyCreateRecheck } from "@myjobhunter/api-client/hooks/useCompanyCreateRecheck";
import { useCreateCompanyMutation } from "@myjobhunter/api-client/store/companiesApi";
import type { CompanyFormValues } from "@myjobhunter/api-client/types/company/company-form-values";
import { companyCreateRequest } from "@myjobhunter/api-client/utils/companyCreateRequest";
import { companyFormCounters } from "@myjobhunter/api-client/utils/companyFormCounters";
import { companyFormProblems } from "@myjobhunter/api-client/utils/companyFormProblems";
import { isDuplicateCompanyDomainError } from "@myjobhunter/api-client/utils/isDuplicateCompanyDomainError";
import { lostCreateMessage } from "@myjobhunter/api-client/utils/lostCreateMessage";
import { clientRefusalMessage } from "@myjobhunter/api-client/utils/clientRefusalMessage";
import type { Company } from "@myjobhunter/api-client/types/company";
import { isCancelledRequest } from "@platform/core/utils/isCancelledRequest";
import { sameFormValues } from "@platform/core/utils/sameFormValues";
import { writeOutcome } from "@platform/core/utils/writeOutcome";
import { FIELD_PRESETS, FormField, FormSheet, useFieldChain, useToast } from "@platform/mobile";
import { useState } from "react";
import { COMPANY_MESSAGES as MESSAGES } from "../../constants/companies";
import type { AddCompanySheetProps } from "../../types/AddCompanySheetProps";
import SheetButtons from "../../components/forms/SheetButtons";

/**
 * The website's Add company dialog: name, domain, industry and HQ. Problems show under their
 * fields once Save is pressed; a domain another company already has is said on that field; any
 * other failure shows at the top and keeps what was typed. After a lost answer the list is read again: a new company with the
 * name is the one sent, so it's said to be added rather than inviting a second. No `maxLength`: a pasted value over
 * the backend's limit would be cut silently, so the validator says so instead.
 */
export default function AddCompanySheet({ onClose }: AddCompanySheetProps) {
  const { showToast } = useToast();
  const [createCompany, { isLoading: isCreating }] = useCreateCompanyMutation();
  const { recheck, isChecking } = useCompanyCreateRecheck();
  const isLoading = isCreating || isChecking;
  const [values, setValues] = useState<CompanyFormValues>(EMPTY_COMPANY_FORM_VALUES);
  const [hasTried, setHasTried] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // The server's 409, until the domain is changed.
  const [isDuplicateDomain, setIsDuplicateDomain] = useState(false);
  const counters = companyFormCounters(values);
  const fields = useFieldChain(["name", "domain", "industry", "hq"]);
  const problems = hasTried ? companyFormProblems(values) : {};

  function change(field: keyof CompanyFormValues) {
    return (value: string) => {
      setValues((current) => ({ ...current, [field]: value }));
      if (field === "primary_domain") setIsDuplicateDomain(false);
    };
  }

  async function save(): Promise<void> {
    setHasTried(true);
    if (Object.keys(companyFormProblems(values)).length > 0) return;
    setFailure(null);
    const request = companyCreateRequest(values);
    let created: Company;
    try {
      created = await createCompany(request).unwrap();
    } catch (error) {
      await settle(request.name, error);
      return;
    }
    added(created);
  }

  function added(company: Company): void {
    showToast(MESSAGES.added(company.name));
    onClose();
  }

  async function settle(name: string, error: unknown): Promise<void> {
    // A cache reset (sign-out, account change) called it off: there's nobody left to tell.
    if (isCancelledRequest(error)) return;
    if (isDuplicateCompanyDomainError(error)) {
      setIsDuplicateDomain(true);
      return;
    }
    if (writeOutcome(error) !== "unknown") {
      setFailure(clientRefusalMessage(error, MESSAGES.couldntAdd));
      return;
    }
    // The server commits before it answers, so a lost answer may mean it was added.
    const check = await recheck(name);
    if (check.kind === "created") added(check.item);
    else setFailure(lostCreateMessage(check, error, { failed: MESSAGES.couldntAdd, checkWhere: LOST_CREATE_CHECK_WHERE.companies }));
  }

  return (
    <FormSheet failure={failure} hasUnsavedChanges={!sameFormValues(values, EMPTY_COMPANY_FORM_VALUES)} isBusy={isLoading} isOpen onRequestClose={onClose} title={MESSAGES.addTitle}>
      <FormField
        {...FIELD_PRESETS.otherName}
        {...fields.field("name")}
        autoFocus
        editable={!isLoading}
        counter={counters.name}
        error={problems.name}
        label={MESSAGES.nameLabel}
        onChangeText={change("name")}
        placeholder={MESSAGES.namePlaceholder}
        required
        value={values.name}
      />
      <FormField
        {...FIELD_PRESETS.url}
        {...fields.field("domain")}
        editable={!isLoading}
        counter={counters.primary_domain}
        error={problems.primary_domain ?? (isDuplicateDomain ? COMPANY_FORM_PROBLEMS.duplicateDomain : undefined)}
        hint={MESSAGES.domainHint}
        label={MESSAGES.domainLabel}
        onChangeText={change("primary_domain")}
        placeholder={MESSAGES.domainPlaceholder}
        value={values.primary_domain}
      />
      <FormField
        {...fields.field("industry")}
        editable={!isLoading}
        counter={counters.industry}
        error={problems.industry}
        label={MESSAGES.industryLabel}
        onChangeText={change("industry")}
        placeholder={MESSAGES.industryPlaceholder}
        value={values.industry}
      />
      <FormField
        {...FIELD_PRESETS.otherAddress}
        {...fields.field("hq")}
        editable={!isLoading}
        counter={counters.hq_location}
        error={problems.hq_location}
        label={MESSAGES.hqLabel}
        onChangeText={change("hq_location")}
        placeholder={MESSAGES.hqPlaceholder}
        value={values.hq_location}
      />
      <SheetButtons
        cancelLabel={MESSAGES.cancel}
        isSubmitting={isLoading}
        onSubmit={save}
        submitLabel={MESSAGES.save}
        submittingLabel={MESSAGES.saving}
      />
    </FormSheet>
  );
}
