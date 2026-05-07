import { describe, it, expect } from "vitest";
import { useApplicantDetailMode } from "@/app/features/applicants/useApplicantDetailMode";
import type { ApplicantDetailResponse } from "@/shared/types/applicant/applicant-detail-response";

const mockApplicant: ApplicantDetailResponse = {
  id: "app-1",
  organization_id: "org-1",
  user_id: "user-1",
  inquiry_id: null,
  legal_name: "Jane Doe",
  dob: null,
  employer_or_hospital: null,
  vehicle_make_model: null,
  contact_email: null,
  contact_phone: null,
  id_document_storage_key: null,
  contract_start: null,
  contract_end: null,
  smoker: null,
  pets: null,
  referred_by: null,
  stage: "lead",
  tenant_ended_at: null,
  tenant_ended_reason: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  screening_results: [],
  references: [],
  video_call_notes: [],
  events: [],
};

describe("useApplicantDetailMode", () => {
  it("returns 'loading' when isLoading is true and no applicant", () => {
    expect(
      useApplicantDetailMode({ isLoading: true, isError: false, applicant: undefined }),
    ).toBe("loading");
  });

  it("returns null (suppress skeleton) when loading but an error already shows", () => {
    expect(
      useApplicantDetailMode({ isLoading: true, isError: true, applicant: undefined }),
    ).toBe(null);
  });

  it("returns 'loading' when applicant is undefined and no error", () => {
    expect(
      useApplicantDetailMode({ isLoading: false, isError: false, applicant: undefined }),
    ).toBe("loading");
  });

  it("returns null when applicant is undefined and there is an error", () => {
    expect(
      useApplicantDetailMode({ isLoading: false, isError: true, applicant: undefined }),
    ).toBe(null);
  });

  it("returns 'content' when applicant is loaded and there is no error", () => {
    expect(
      useApplicantDetailMode({ isLoading: false, isError: false, applicant: mockApplicant }),
    ).toBe("content");
  });

  it("returns 'content' even when isError is true but applicant is defined (stale data case)", () => {
    expect(
      useApplicantDetailMode({ isLoading: false, isError: true, applicant: mockApplicant }),
    ).toBe("content");
  });
});
