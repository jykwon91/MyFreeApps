import api from "@platform/core/lib/api";
import type { ApplicantDetailResponse } from "@mybookkeeper/api-client/types/applicant/applicant-detail-response";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";

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
}

export function startApplicantServer(applicants: ApplicantDetailResponse[]): FakeApplicantServer {
  const server: FakeApplicantServer = { applicants, offline: false, failListFromOffset: null, role: "owner", writeFailure: null, loseNextAnswer: false, requests: [] };
  const adapter: AxiosAdapter = (config) => {
    const respond = (data: unknown, status = 200) => {
      const response = { data: JSON.parse(JSON.stringify(data)), status, statusText: "", headers: {}, config };
      if (status < 400) return Promise.resolve(response);
      return Promise.reject(Object.assign(new Error(String(status)), { config, response, isAxiosError: true }));
    };
    server.requests.push(config);
    if (server.offline) return Promise.reject(Object.assign(new Error("Network Error"), { config }));
    if (config.url === "/organizations") return respond([{ id: "w1", name: "Mine", org_role: server.role }]);
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
