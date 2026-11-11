import { COMPANY_FORM_PROBLEMS } from "@myjobhunter/api-client/constants/companyFormProblems";
import { EMPTY_COMPANY_FORM_VALUES } from "@myjobhunter/api-client/constants/emptyCompanyFormValues";
import { useCreateCompanyMutation } from "@myjobhunter/api-client/store/companiesApi";
import type { CompanyFormValues } from "@myjobhunter/api-client/types/company/company-form-values";
import { companyCreateRequest } from "@myjobhunter/api-client/utils/companyCreateRequest";
import { companyFormCounters } from "@myjobhunter/api-client/utils/companyFormCounters";
import { companyFormProblems } from "@myjobhunter/api-client/utils/companyFormProblems";
import { isDuplicateCompanyDomainError } from "@myjobhunter/api-client/utils/isDuplicateCompanyDomainError";
import { FormField, FormSheet, useToast } from "@platform/mobile";
import { useState } from "react";
import { COMPANY_MESSAGES as MESSAGES } from "../../constants/companies";
import type { AddCompanySheetProps } from "../../types/AddCompanySheetProps";
import SheetButtons from "../../components/forms/SheetButtons";

/**
 * The website's Add company dialog: name, domain, industry and HQ. Problems show under their
 * fields once Save is pressed; a domain another company already has is said on that field; any
 * other failure shows at the top and keeps what was typed. No `maxLength`: a pasted value over
 * the backend's limit would be cut silently, so the validator says so instead.
 */
export default function AddCompanySheet({ onClose }: AddCompanySheetProps) {
  const { showToast } = useToast();
  const [createCompany, { isLoading }] = useCreateCompanyMutation();
  const [values, setValues] = useState<CompanyFormValues>(EMPTY_COMPANY_FORM_VALUES);
  const [hasTried, setHasTried] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // The server's 409, until the domain is changed.
  const [isDuplicateDomain, setIsDuplicateDomain] = useState(false);
  const counters = companyFormCounters(values);
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
    try {
      const created = await createCompany(companyCreateRequest(values)).unwrap();
      showToast(MESSAGES.added(created.name));
      onClose();
    } catch (error) {
      if (isDuplicateCompanyDomainError(error)) setIsDuplicateDomain(true);
      else setFailure(MESSAGES.couldntAdd);
    }
  }

  return (
    <FormSheet failure={failure} isOpen onRequestClose={() => (isLoading ? undefined : onClose())} title={MESSAGES.addTitle}>
      <FormField
        autoCapitalize="words"
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
        autoCapitalize="none"
        autoCorrect={false}
        editable={!isLoading}
        counter={counters.primary_domain}
        error={problems.primary_domain ?? (isDuplicateDomain ? COMPANY_FORM_PROBLEMS.duplicateDomain : undefined)}
        hint={MESSAGES.domainHint}
        keyboardType="url"
        label={MESSAGES.domainLabel}
        onChangeText={change("primary_domain")}
        placeholder={MESSAGES.domainPlaceholder}
        value={values.primary_domain}
      />
      <FormField
        editable={!isLoading}
        counter={counters.industry}
        error={problems.industry}
        label={MESSAGES.industryLabel}
        onChangeText={change("industry")}
        placeholder={MESSAGES.industryPlaceholder}
        value={values.industry}
      />
      <FormField
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
        onCancel={onClose}
        onSubmit={save}
        submitLabel={MESSAGES.save}
        submittingLabel={MESSAGES.saving}
      />
    </FormSheet>
  );
}
