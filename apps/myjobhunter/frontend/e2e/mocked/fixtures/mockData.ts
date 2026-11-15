import type { Application } from "@myjobhunter/api-client/types/application";
import type { Document } from "@myjobhunter/api-client/types/document/document";
import type { Company } from "@myjobhunter/api-client/types/company";
import type { Profile } from "@myjobhunter/api-client/types/profile/profile";
import type { ResumeUploadJob } from "@myjobhunter/api-client/types/resume-upload-job/resume-upload-job";
import type { WorkHistory } from "@myjobhunter/api-client/types/work-history/work-history";

const TIMESTAMP = "2026-11-01T00:00:00+00:00";

export function mockCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: "00000000-0000-0000-0000-0000000000c1",
    user_id: "00000000-0000-0000-0000-000000000001",
    name: "Acme Corp",
    primary_domain: "acme.com",
    logo_url: null,
    industry: "SaaS",
    size_range: null,
    hq_location: "Austin, TX",
    description: null,
    external_ref: null,
    external_source: null,
    crunchbase_id: null,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    ...overrides,
  };
}

export function mockApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: "00000000-0000-0000-0000-0000000000a1",
    user_id: "00000000-0000-0000-0000-000000000001",
    company_id: "00000000-0000-0000-0000-0000000000c1",
    role_title: "Staff Engineer",
    url: null,
    jd_text: null,
    jd_parsed: null,
    source: null,
    applied_at: null,
    posted_salary_min: null,
    posted_salary_max: null,
    posted_salary_currency: "USD",
    posted_salary_period: null,
    location: "Remote",
    remote_type: "remote",
    fit_score: null,
    notes: null,
    archived: false,
    external_ref: null,
    external_source: null,
    latest_status: null,
    company_name: "Acme Corp",
    deleted_at: null,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    ...overrides,
  };
}

export function mockDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: "00000000-0000-0000-0000-0000000000d1",
    user_id: "00000000-0000-0000-0000-000000000001",
    application_id: null,
    title: "Cover Letter Draft",
    kind: "cover_letter",
    body: "Dear hiring manager",
    filename: null,
    content_type: null,
    size_bytes: null,
    has_file: false,
    deleted_at: null,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    ...overrides,
  };
}

export function mockProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "00000000-0000-0000-0000-0000000000p1",
    user_id: "00000000-0000-0000-0000-000000000001",
    resume_file_path: null,
    parser_version: null,
    parsed_at: null,
    work_auth_status: "unknown",
    desired_salary_min: null,
    desired_salary_max: null,
    salary_currency: "USD",
    salary_period: "annual",
    locations: [],
    remote_preference: "any",
    seniority: null,
    summary: null,
    timezone: null,
    discovery_defaults: {},
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    ...overrides,
  };
}

export function mockWorkHistory(overrides: Partial<WorkHistory> = {}): WorkHistory {
  return {
    id: "00000000-0000-0000-0000-0000000000w1",
    user_id: "00000000-0000-0000-0000-000000000001",
    profile_id: "00000000-0000-0000-0000-0000000000p1",
    company_name: "Globex",
    title: "Senior Engineer",
    start_date: "2022-01-01",
    end_date: null,
    is_current: true,
    bullets: [],
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    ...overrides,
  };
}

export function mockResumeJob(overrides: Partial<ResumeUploadJob> = {}): ResumeUploadJob {
  return {
    id: "00000000-0000-0000-0000-0000000000r1",
    profile_id: "00000000-0000-0000-0000-0000000000p1",
    file_filename: "resume.pdf",
    file_content_type: "application/pdf",
    file_size_bytes: 1000,
    status: "queued",
    error_message: null,
    result_parsed_fields: null,
    parser_version: null,
    started_at: null,
    completed_at: null,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    ...overrides,
  };
}
