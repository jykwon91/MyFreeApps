import type { Application } from "@myjobhunter/api-client/types/application";
import type { Document } from "@myjobhunter/api-client/types/document/document";
import type { Company } from "@myjobhunter/api-client/types/company";

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
