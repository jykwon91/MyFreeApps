import {
  ADD_APPLICATION_FORM_PROBLEMS as PROBLEMS,
  JD_READ_LONG_RUNNING_MS,
  JD_TEXT_MAX_LENGTH,
  JOB_URL_MAX_LENGTH,
} from "@myjobhunter/api-client/constants/addApplicationForm";
import { useCreateApplicationMutation, useExtractJdFromUrlMutation, useParseJobDescriptionMutation } from "@myjobhunter/api-client/store/applicationsApi";
import {
  useCreateCompanyMutation,
  useLazyListCompaniesQuery,
  useListCompaniesQuery,
  useTriggerCompanyResearchMutation,
} from "@myjobhunter/api-client/store/companiesApi";
import type { AddApplicationFormValues } from "@myjobhunter/api-client/types/application/add-application-form-values";
import type { ExtractedCompanyHints } from "@myjobhunter/api-client/types/application/extracted-company-hints";
import type { ReviewCompanyState } from "@myjobhunter/api-client/types/application/review-company-state";
import type { Company } from "@myjobhunter/api-client/types/company";
import type { CompanyCreateRequest } from "@myjobhunter/api-client/types/company-create-request";
import { addApplicationFormProblems } from "@myjobhunter/api-client/utils/addApplicationFormProblems";
import { buildApplicationCreateRequest } from "@myjobhunter/api-client/utils/buildApplicationCreateRequest";
import { describeExtractError } from "@myjobhunter/api-client/utils/describeExtractError";
import { findCompanyByName } from "@myjobhunter/api-client/utils/findCompanyByName";
import { isAuthRequiredError } from "@myjobhunter/api-client/utils/isAuthRequiredError";
import { isJobPostingUrl } from "@myjobhunter/api-client/utils/isJobPostingUrl";
import { prefillFromExtract } from "@myjobhunter/api-client/utils/prefillFromExtract";
import { prefillFromParse } from "@myjobhunter/api-client/utils/prefillFromParse";
import { readCompanyId } from "@myjobhunter/api-client/utils/readCompanyId";
import { resolveExtractedCompany } from "@myjobhunter/api-client/utils/resolveExtractedCompany";
import { useLeaveWhenSaved, useToast } from "@platform/mobile";
import * as Clipboard from "expo-clipboard";
import { useEffect, useRef, useState } from "react";
import { ADD_APPLICATION_MESSAGES as MESSAGES, EMPTY_ADD_APPLICATION_FORM } from "../../constants/addApplication";
import { htmlTextContent } from "../../lib/htmlTextContent";
import { urlHostname } from "../../lib/urlHostname";
import type { AddApplicationReading } from "../../types/AddApplicationReading";
import type { AddApplicationReview } from "../../types/AddApplicationReview";
import type { AddApplicationSource } from "../../types/AddApplicationSource";

/**
 * Adding an application, as the website's Add application dialog does it: read a link or pasted
 * text into the form (matching or adding its company), or choose the company and type the rest,
 * then review and save. Reading's failures are said in `failure`, a banner above the form; saving's
 * are toasted, as the website toasts them. Nothing runs on once the screen has gone.
 */
export function useAddApplicationFlow() {
  const { showToast } = useToast();
  // Starts loading the companies as the screen opens; matching waits for them (loadCompanies).
  useListCompaniesQuery();
  const [loadCompanies] = useLazyListCompaniesQuery();
  const [extractJdFromUrl] = useExtractJdFromUrlMutation();
  const [parseJobDescription] = useParseJobDescriptionMutation();
  const [createCompany] = useCreateCompanyMutation();
  const [triggerCompanyResearch] = useTriggerCompanyResearchMutation();
  const [createApplication] = useCreateApplicationMutation();
  const { isLeaving, leave } = useLeaveWhenSaved("/applications");

  const [source, setSourceState] = useState<AddApplicationSource>("url");
  const [urlValue, setUrlValue] = useState("");
  const [textValue, setTextValue] = useState("");
  const [reading, setReading] = useState<AddApplicationReading>(null);
  const [isLongRunning, setIsLongRunning] = useState(false);
  const [blockedNotice, setBlockedNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // Null until the source is read, or a company is chosen for one typed in by hand.
  const [review, setReview] = useState<AddApplicationReview | null>(null);
  const [values, setValues] = useState<AddApplicationFormValues>(EMPTY_ADD_APPLICATION_FORM);
  const [submittedJdText, setSubmittedJdText] = useState("");
  const [hasTried, setHasTried] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // False once the screen has gone, so a read that finishes later neither adds a company nor
  // fills a form nobody sees; the read itself is aborted then.
  const isMounted = useRef(true);
  const inFlightRead = useRef<{ abort: () => void } | null>(null);

  const problems = addApplicationFormProblems(values);
  const textError = textValue.trim().length > JD_TEXT_MAX_LENGTH ? PROBLEMS.jdTextTooLong : null;
  const isDirty = urlValue.trim() !== "" || textValue.trim() !== "" || review !== null;

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      inFlightRead.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!reading) return;
    const timer = setTimeout(() => setIsLongRunning(true), JD_READ_LONG_RUNNING_MS);
    return () => clearTimeout(timer);
  }, [reading]);

  function setSource(next: AddApplicationSource): void {
    // The sign-in notice explains the text tab; anywhere else it's out of place.
    if (next !== "text") setBlockedNotice(null);
    setFailure(null);
    setSourceState(next);
  }

  function startReading(kind: Exclude<AddApplicationReading, null>): void {
    setFailure(null);
    setBlockedNotice(null);
    setIsLongRunning(false);
    setReading(kind);
  }

  function prefill(next: Partial<AddApplicationFormValues>): void {
    setValues({ ...EMPTY_ADD_APPLICATION_FORM, ...next });
  }

  /** A new company starts its background research; a failure there doesn't stop the add. */
  async function addCompany(request: CompanyCreateRequest): Promise<Company> {
    const created = await createCompany(request).unwrap();
    void triggerCompanyResearch(created.id)
      .unwrap()
      .catch((error: unknown) => console.warn("Background company research failed:", error));
    return created;
  }

  /** Every tracked company, waiting for the list if it hasn't loaded, so one isn't added twice. */
  async function trackedCompanies(): Promise<Company[]> {
    return (await loadCompanies(undefined, true).unwrap()).items;
  }

  /** The company a read posting names: tracked, added now, or left to fix. Null once the screen has gone. */
  async function resolveCompany(name: string | null, hints: ExtractedCompanyHints): Promise<ReviewCompanyState | null> {
    let companies: Company[];
    try {
      companies = await trackedCompanies();
    } catch {
      if (!isMounted.current) return null;
      const typed = name?.trim() ?? "";
      if (typed) setFailure(MESSAGES.couldntAddCompany);
      return { kind: "autoCreateFailed", name: typed };
    }
    if (!isMounted.current) return null;
    const resolution = resolveExtractedCompany(companies, name, urlHostname, hints);
    if (resolution.kind === "none") return { kind: "autoCreateFailed", name: "" };
    if (resolution.kind === "existing") {
      const { id, name: existingName, logo_url } = resolution.company;
      return { kind: "tracked", companyId: id, name: existingName, logoUrl: logo_url };
    }
    try {
      const created = await addCompany(resolution.request);
      return { kind: "new", companyId: created.id, name: created.name, logoUrl: created.logo_url };
    } catch {
      if (!isMounted.current) return null;
      setFailure(MESSAGES.couldntAddCompany);
      return { kind: "autoCreateFailed", name: resolution.request.name };
    }
  }

  function linkProblem(url: string): string | null {
    if (!isJobPostingUrl(url)) return MESSAGES.notALink;
    if (url.length > JOB_URL_MAX_LENGTH) return PROBLEMS.jobUrlTooLong;
    return null;
  }

  async function readLink(link: string = urlValue): Promise<void> {
    const url = link.trim();
    if (!url || reading) return;
    const problem = linkProblem(url);
    if (problem) {
      setFailure(problem);
      return;
    }
    setUrlValue(url);
    startReading("url");
    const request = extractJdFromUrl({ url });
    inFlightRead.current = request;
    try {
      const result = await request.unwrap();
      if (!isMounted.current) return;
      const company = await resolveCompany(result.company, { website: result.company_website, logoUrl: result.company_logo_url });
      if (!company) return;
      prefill(prefillFromExtract(result, htmlTextContent));
      setReview({ sourceUrl: result.source_url, summary: result.summary, company });
    } catch (error) {
      if (!isMounted.current) return;
      if (isAuthRequiredError(error)) {
        setSourceState("text");
        setBlockedNotice(MESSAGES.linkBlocked);
      } else {
        setFailure(`${MESSAGES.couldntAutoFill} ${describeExtractError(error)}`);
      }
    } finally {
      inFlightRead.current = null;
      if (isMounted.current) setReading(null);
    }
  }

  /** Reads the link on the clipboard straight away. Anything else there leaves the typed link alone. */
  async function pasteLink(): Promise<void> {
    if (reading) return;
    let pasted: string;
    try {
      pasted = (await Clipboard.getStringAsync()).trim();
    } catch {
      if (isMounted.current) setFailure(MESSAGES.couldntReadClipboard);
      return;
    }
    if (!isMounted.current) return;
    if (!pasted) {
      setFailure(MESSAGES.noLinkOnClipboard);
      return;
    }
    await readLink(pasted);
  }

  async function readText(): Promise<void> {
    const text = textValue.trim();
    if (!text || reading || textError) return;
    startReading("text");
    const request = parseJobDescription({ jd_text: text });
    inFlightRead.current = request;
    try {
      const result = await request.unwrap();
      if (!isMounted.current) return;
      const company = await resolveCompany(result.company, {});
      if (!company) return;
      setSubmittedJdText(text);
      prefill(prefillFromParse(result));
      setReview({ sourceUrl: null, summary: result.summary, company });
    } catch {
      if (isMounted.current) setFailure(MESSAGES.couldntReadText);
    } finally {
      inFlightRead.current = null;
      if (isMounted.current) setReading(null);
    }
  }

  /**
   * From the company picker. Typing it in by hand starts here: the pick opens the review form,
   * and counts as chosen rather than matched, as on the website.
   */
  function chooseCompany(company: Company): void {
    const kind = review ? "tracked" : "manual";
    setFailure(null);
    const chosen: ReviewCompanyState = { kind, companyId: company.id, name: company.name, logoUrl: company.logo_url };
    setReview((current) => ({ sourceUrl: current?.sourceUrl ?? null, summary: current?.summary ?? null, company: chosen }));
  }

  /** Adds a company typed into the picker. Throws, so the picker can say it failed and stay open. */
  async function addTypedCompany(name: string): Promise<void> {
    const created = await addCompany({ name: name.trim() });
    setFailure(null);
    const added: ReviewCompanyState = { kind: "new", companyId: created.id, name: created.name, logoUrl: created.logo_url };
    setReview((current) => ({ sourceUrl: current?.sourceUrl ?? null, summary: current?.summary ?? null, company: added }));
  }

  function edit<Field extends keyof AddApplicationFormValues>(field: Field, value: AddApplicationFormValues[Field]): void {
    setValues((current) => ({ ...current, [field]: value }));
  }

  /** The company to save under, adding the one whose auto-add failed if that's what's there. */
  async function companyIdForSave(company: ReviewCompanyState): Promise<string | null> {
    const id = readCompanyId(company);
    if (id || company.kind !== "autoCreateFailed" || !company.name) return id;
    const tracked = await trackedCompanies();
    if (!isMounted.current) return null;
    const existing = findCompanyByName(tracked, company.name);
    if (existing) return existing.id;
    const created = await createCompany({ name: company.name }).unwrap();
    return created.id;
  }

  /** Saving's failures are toasted, as on the website, where the button that was pressed is. */
  function saveFailed(message: string): void {
    showToast(message, "error");
  }

  async function save(): Promise<void> {
    setHasTried(true);
    if (!review || isSaving || Object.keys(problems).length > 0) return;
    setFailure(null);
    setIsSaving(true);
    try {
      let companyId: string | null;
      try {
        companyId = await companyIdForSave(review.company);
      } catch {
        if (isMounted.current) saveFailed(MESSAGES.couldntAddCompany);
        return;
      }
      if (!isMounted.current) return;
      if (!companyId) {
        saveFailed(MESSAGES.companyRequired);
        return;
      }
      try {
        await createApplication(buildApplicationCreateRequest(values, { companyId, sourceUrl: review.sourceUrl, jdText: submittedJdText })).unwrap();
      } catch {
        if (isMounted.current) saveFailed(MESSAGES.couldntSave);
        return;
      }
      showToast(MESSAGES.added);
      leave();
    } finally {
      if (isMounted.current) setIsSaving(false);
    }
  }

  return {
    source,
    setSource,
    urlValue,
    setUrlValue,
    textValue,
    setTextValue,
    textError,
    reading,
    isLongRunning,
    blockedNotice,
    failure,
    review,
    values,
    edit,
    errors: hasTried ? problems : {},
    isSaving,
    isLeaving,
    isDirty,
    readLink,
    pasteLink,
    readText,
    chooseCompany,
    addTypedCompany,
    save,
  };
}
