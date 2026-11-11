import type { JobAnalysis } from "@myjobhunter/api-client/types/job-analysis/job-analysis";

/** An analysis as POST /jobs/analyze returns it: every dimension, a flag of each colour. */
export function analysisRecord(overrides: Partial<JobAnalysis> = {}): JobAnalysis {
  return {
    id: "an-1",
    user_id: "u1",
    source_url: null,
    jd_text: "Build payments infra.",
    fingerprint: "0".repeat(64),
    extracted: {
      title: "Staff Engineer",
      company: "Stripe",
      location: "Seattle, WA",
      remote_type: "hybrid",
      posted_salary_min: 180000,
      posted_salary_max: 240000,
      posted_salary_currency: "USD",
      posted_salary_period: "year",
      summary: "Payments platform role.",
    },
    verdict: "worth_considering",
    verdict_summary: "Skills line up; the salary is below your floor.",
    // Out of the rubric's order, as a cache could reorder them.
    dimensions: [
      { key: "work_auth", status: "compatible", rationale: "Citizen, fine." },
      { key: "salary", status: "below_target", rationale: "Top is $240k." },
      { key: "skill_match", status: "strong", rationale: "Go and Postgres covered." },
      { key: "location_remote", status: "stretch", rationale: "Hybrid, three days." },
      { key: "seniority", status: "aligned", rationale: "Staff matches staff." },
    ],
    red_flags: ["On-call every other week"],
    green_flags: ["Learning budget"],
    total_tokens_in: 1200,
    total_tokens_out: 400,
    total_cost_usd: 0.01,
    applied_application_id: null,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    ...overrides,
  };
}
