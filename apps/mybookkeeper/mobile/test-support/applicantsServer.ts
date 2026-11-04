import api from "@platform/core/lib/api";
import type { ApplicantDetailResponse } from "@mybookkeeper/api-client/types/applicant/applicant-detail-response";
import type { ScreeningEligibilityResponse } from "@mybookkeeper/api-client/types/applicant/screening-eligibility-response";
import type { ApplicantSensitive } from "@mybookkeeper/api-client/types/applicant/applicant-sensitive";
import { tenancyState } from "@mybookkeeper/api-client/utils/tenancyState";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import { aRentLedger } from "./aRentLedger";
import { aReminderOverview } from "./aRentReminder";

export function anApplicant(overrides: Partial<ApplicantDetailResponse> = {}): ApplicantDetailResponse {
  return {
    id: "a1",
    organization_id: "w1",
    user_id: "u1",
    inquiry_id: "i1",
    legal_name: "Dana Reed",
    employer_or_hospital: "Memorial Hospital",
    has_contact_email: true,
    contract_start: "2026-12-01",
    contract_end: "2027-03-01",
    smoker: false,
    pets: "One small dog",
    referred_by: "Sam",
    stage: "screening_passed",
    tenant_ended_at: null,
    tenant_ended_reason: null,
    created_at: "2026-11-01T12:00:00Z",
    updated_at: "2026-11-01T12:00:00Z",
    screening_results: [],
    references: [],
    video_call_notes: [],
    events: [],
    ...overrides,
  };
}

export interface FakeApplicantServer {
  applicants: ApplicantDetailResponse[];
  offline: boolean;
  failListFromOffset: number | null;
  role: string;
  writeFailure: number | null;
  loseNextAnswer: boolean;
  requests: AxiosRequestConfig[];
  sensitive: ApplicantSensitive;
  eligibility: ScreeningEligibilityResponse;
  eligibilityFailure: number | null;
  redirectFailure: number | null;
  uploadFailure: number | null;
  revealFailure: number | null;
  tenantListFailure: number | null;
}

export const SAMPLE_PROVIDER = {
  name: "keycheck",
  label: "KeyCheck",
  description: "Credit and background checks.",
  cost_label: "$35",
  turnaround_label: "1-2 days",
  external_url: "https://keycheck.example/dashboard",
};

export function noPrivateDetails(overrides: Partial<ApplicantSensitive> = {}): ApplicantSensitive {
  return {
    dob: null,
    vehicle_make_model: null,
    contact_email: null,
    contact_phone: null,
    references: [],
    screening_reports: [],
    ...overrides,
  };
}

/** React Native's FormData only offers getParts. */
export function formParts(form: unknown): { fieldName: string; name?: string; type?: string; string?: string }[] {
  return (form as { getParts: () => { fieldName: string; name?: string; type?: string; string?: string }[] }).getParts();
}

export function formValue(form: unknown, field: string): string | undefined {
  return formParts(form).find((part) => part.fieldName === field)?.string;
}

export function startApplicantServer(applicants: ApplicantDetailResponse[]): FakeApplicantServer {
  const server: FakeApplicantServer = { tenantListFailure: null, applicants, offline: false, failListFromOffset: null, role: "owner", writeFailure: null, loseNextAnswer: false, requests: [], sensitive: noPrivateDetails(), revealFailure: null, eligibility: { eligible: true, missing_fields: [], has_pending: false }, eligibilityFailure: null, redirectFailure: null, uploadFailure: null };
  const adapter: AxiosAdapter = (config) => {
    const respond = (data: unknown, status = 200) => {
      const response = { data: JSON.parse(JSON.stringify(data)), status, statusText: "", headers: {}, config };
      if (status < 400) return Promise.resolve(response);
      return Promise.reject(Object.assign(new Error(String(status)), { config, response, isAxiosError: true }));
    };
    server.requests.push(config);
    if (server.offline) return Promise.reject(Object.assign(new Error("Network Error"), { config }));
    if (config.url === "/organizations") return respond([{ id: "w1", name: "Mine", org_role: server.role }]);
    if (config.method === "post" && config.url?.endsWith("/sensitive")) {
      return server.revealFailure ? respond({ detail: "nope" }, server.revealFailure) : respond(server.sensitive);
    }
    if (config.url?.endsWith("/screening/eligibility")) {
      return server.eligibilityFailure ? respond({ detail: "nope" }, server.eligibilityFailure) : respond(server.eligibility);
    }
    if (config.url?.endsWith("/screening/providers")) return respond({ providers: [SAMPLE_PROVIDER] });
    if (config.url?.includes("/screening/redirect")) {
      return server.redirectFailure ? respond({ detail: "nope" }, server.redirectFailure) : respond({ redirect_url: SAMPLE_PROVIDER.external_url, provider: "keycheck" });
    }
    if (config.url?.endsWith("/screening/upload-result")) {
      if (server.uploadFailure) return respond({ detail: "A developer's message" }, server.uploadFailure);
      const row = server.applicants.find((candidate) => config.url?.startsWith(`/applicants/${candidate.id}/`));
      const form = config.data as FormData;
      const result = {
        id: `s${server.requests.length}`, applicant_id: row?.id ?? "", provider: "keycheck", status: formValue(form, "status") ?? "", has_report: true, notes: null,
        requested_at: "2026-11-03T12:00:00Z", completed_at: "2026-11-03T12:00:00Z", uploaded_at: "2026-11-03T12:00:00Z", uploaded_by_user_id: "u1", created_at: "2026-11-03T12:00:00Z",
      };
      row?.screening_results.push(result);
      return respond(result, 201);
    }
    if (config.url === "/signed-leases") return respond({ items: [], total: 0, has_more: false });
    if (config.url === "/transactions") return respond([]);
    if (config.url?.startsWith("/rent-ledger/tenants/")) return respond(aRentLedger());
    if (config.url?.endsWith("/preview") && config.url.startsWith("/rent-reminders/")) return respond(null);
    if (config.url?.endsWith("/sends") && config.url.startsWith("/rent-reminders/")) return respond([]);
    if (config.url?.startsWith("/rent-reminders/tenants/")) return respond(aReminderOverview({ plan: null }));
    if (config.url === "/applicants/tenants") {
      if (server.tenantListFailure) return respond({ detail: "nope" }, server.tenantListFailure);
      const params = config.params as { include_ended: boolean; today: string; limit: number; offset: number };
      const today = params.today;
      const rows = server.applicants.filter((row) => row.stage === "lease_signed" && (params.include_ended || tenancyState(row, today) === "active"));
      const items = rows.slice(params.offset, params.offset + params.limit);
      return respond({ items, total: rows.length, has_more: params.offset + items.length < rows.length });
    }
    if (config.url?.endsWith("/tenancy/end") || config.url?.endsWith("/tenancy/restart")) {
      if (server.writeFailure) return respond({ detail: "A developer's message" }, server.writeFailure);
      const row = server.applicants.find((candidate) => config.url?.startsWith(`/applicants/${candidate.id}/`));
      if (!row) return respond({ detail: "Applicant not found" }, 404);
      const isEnding = config.url.endsWith("/end");
      row.tenant_ended_at = isEnding ? "2026-11-04T12:00:00Z" : null;
      row.tenant_ended_reason = isEnding ? (JSON.parse(String(config.data)) as { reason: string | null }).reason : null;
      return respond(row);
    }
    if (config.method === "patch") {
      if (server.writeFailure) return respond({ detail: "A developer's message" }, server.writeFailure);
      const body = JSON.parse(String(config.data)) as { new_stage?: ApplicantDetailResponse["stage"]; contract_start?: string | null };
      const row = server.applicants.find((candidate) => config.url?.startsWith(`/applicants/${candidate.id}`));
      if (!row) return respond({ detail: "Applicant not found" }, 404);
      if (config.url?.endsWith("/stage")) row.stage = body.new_stage ?? row.stage;
      else row.contract_start = body.contract_start ?? null;
      if (server.loseNextAnswer) {
        server.loseNextAnswer = false;
        return Promise.reject(Object.assign(new Error("Network Error"), { config }));
      }
      return respond(row);
    }
    if (config.url === "/applicants") {
      const params = (config.params ?? {}) as Record<string, string | number | undefined>;
      const offset = Number(params.offset ?? 0);
      const limit = Number(params.limit ?? 25);
      if (server.failListFromOffset !== null && offset >= server.failListFromOffset) return respond({ detail: "nope" }, 500);
      const matches = server.applicants.filter((row) => !params.stage || row.stage === params.stage);
      return respond({ items: matches.slice(offset, offset + limit), total: matches.length, has_more: offset + limit < matches.length });
    }
    const found = server.applicants.find((row) => config.url === `/applicants/${row.id}`);
    return found ? respond(found) : respond({ detail: "Applicant not found" }, 404);
  };
  api.defaults.adapter = adapter;
  return server;
}
