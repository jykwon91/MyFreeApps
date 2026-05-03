import { test, expect, type APIRequestContext } from "./fixtures/auth";

/**
 * E2E tests for the lease-template-source-pull enhancements:
 *
 * - Backend: ``GET /lease-templates/{id}/generate-defaults?applicant_id=``
 *   correctly resolves defaults with inquiry fallback.
 *
 * NOTE: ``LeaseGenerateForm`` is a component built in PR #175 but not yet
 * integrated into any app route (the consuming page is a future PR). These
 * E2E tests therefore cover the backend API layer directly — the component
 * behavior (provenance badges, applicant switch re-pull, Pull-from-source) is
 * fully covered by ``LeaseGenerateForm.test.tsx`` Vitest unit tests.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function seedTemplate(
  api: APIRequestContext,
  payload: { name?: string; source_text?: string } = {},
): Promise<string> {
  const res = await api.post("/test/seed-lease-template", { data: payload });
  if (!res.ok()) {
    throw new Error(`seedTemplate failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}

async function deleteTemplate(api: APIRequestContext, id: string): Promise<void> {
  await api.delete(`/test/lease-templates/${id}`).catch(() => {});
}

async function seedInquiry(
  api: APIRequestContext,
  payload: {
    source?: string;
    inquirer_name?: string | null;
    inquirer_email?: string | null;
    inquirer_phone?: string | null;
    inquirer_employer?: string | null;
    desired_start_date?: string | null;
    desired_end_date?: string | null;
  } = {},
): Promise<string> {
  const res = await api.post("/test/seed-inquiry", {
    data: {
      source: "direct",
      received_at: new Date().toISOString(),
      ...payload,
    },
  });
  if (!res.ok()) {
    throw new Error(`seedInquiry failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}

async function deleteInquiry(api: APIRequestContext, id: string): Promise<void> {
  await api.delete(`/test/inquiries/${id}`).catch(() => {});
}

async function seedApplicant(
  api: APIRequestContext,
  payload: {
    inquiry_id?: string | null;
    legal_name?: string | null;
    employer_or_hospital?: string | null;
    contract_start?: string | null;
    contract_end?: string | null;
    stage?: string;
  } = {},
): Promise<string> {
  const res = await api.post("/test/seed-applicant", {
    data: { stage: "lead", seed_event: false, ...payload },
  });
  if (!res.ok()) {
    throw new Error(`seedApplicant failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}

async function deleteApplicant(api: APIRequestContext, id: string): Promise<void> {
  await api.delete(`/test/applicants/${id}`).catch(() => {});
}

async function getGenerateDefaults(
  api: APIRequestContext,
  templateId: string,
  applicantId: string,
) {
  const res = await api.get(
    `/lease-templates/${templateId}/generate-defaults?applicant_id=${applicantId}`,
  );
  return { status: res.status(), body: await res.json() };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("generate-defaults API (lease-template-source-pull)", () => {
  test(
    "applicant with full data — name resolves from applicant, provenance=applicant",
    async ({ api }) => {
      const runId = Date.now();
      const seededTemplates: string[] = [];
      const seededApplicants: string[] = [];
      const seededInquiries: string[] = [];

      try {
        const templateId = await seedTemplate(api, {
          name: `E2E Defaults Full ${runId}`,
        });
        seededTemplates.push(templateId);

        const applicantId = await seedApplicant(api, {
          legal_name: "Jane Full Doe",
          stage: "lead",
        });
        seededApplicants.push(applicantId);

        const { status, body } = await getGenerateDefaults(
          api, templateId, applicantId,
        );
        expect(status).toBe(200);

        const nameDefault = (body.defaults as Array<{
          key: string;
          value: string | null;
          provenance: string | null;
        }>).find((d) => d.key === "TENANT FULL NAME");

        expect(nameDefault).toBeDefined();
        expect(nameDefault?.value).toBe("Jane Full Doe");
        expect(nameDefault?.provenance).toBe("applicant");
      } finally {
        for (const id of seededTemplates) await deleteTemplate(api, id);
        for (const id of seededApplicants) await deleteApplicant(api, id);
        for (const id of seededInquiries) await deleteInquiry(api, id);
      }
    },
  );

  test(
    "sparse applicant + inquiry with full data — name falls back to inquiry, provenance=inquiry",
    async ({ api }) => {
      const runId = Date.now();
      const seededTemplates: string[] = [];
      const seededApplicants: string[] = [];
      const seededInquiries: string[] = [];

      try {
        const templateId = await seedTemplate(api, {
          name: `E2E Defaults Fallback ${runId}`,
        });
        seededTemplates.push(templateId);

        // Seed inquiry with full PII data.
        const inquiryId = await seedInquiry(api, {
          inquirer_name: "Inquiry Tenant Name",
          inquirer_email: "tenant@example.com",
          inquirer_phone: "555-0100",
          inquirer_employer: "Inquiry Employer",
          desired_start_date: "2026-07-01",
          desired_end_date: "2027-06-30",
        });
        seededInquiries.push(inquiryId);

        // Sparse applicant: no legal_name, no employer, no contract dates.
        // Linked to the inquiry so the fallback chain fires.
        const applicantId = await seedApplicant(api, {
          inquiry_id: inquiryId,
          legal_name: null,
          employer_or_hospital: null,
          contract_start: null,
          contract_end: null,
        });
        seededApplicants.push(applicantId);

        const { status, body } = await getGenerateDefaults(
          api, templateId, applicantId,
        );
        expect(status).toBe(200);

        const defaults = body.defaults as Array<{
          key: string;
          value: string | null;
          provenance: string | null;
        }>;

        // Name should fall back to inquiry.
        const nameDefault = defaults.find((d) => d.key === "TENANT FULL NAME");
        expect(nameDefault?.value).toBe("Inquiry Tenant Name");
        expect(nameDefault?.provenance).toBe("inquiry");

        // Email — only on inquiry (applicant has no email field).
        const emailDefault = defaults.find((d) => d.key === "TENANT EMAIL");
        expect(emailDefault?.value).toBe("tenant@example.com");
        expect(emailDefault?.provenance).toBe("inquiry");

        // Move-in date falls back to inquiry.desired_start_date.
        const moveInDefault = defaults.find((d) => d.key === "MOVE-IN DATE");
        expect(moveInDefault?.value).toBe("2026-07-01");
        expect(moveInDefault?.provenance).toBe("inquiry");
      } finally {
        for (const id of seededTemplates) await deleteTemplate(api, id);
        for (const id of seededApplicants) await deleteApplicant(api, id);
        for (const id of seededInquiries) await deleteInquiry(api, id);
      }
    },
  );

  test(
    "applicant with no linked inquiry — email and phone resolve to null",
    async ({ api }) => {
      const runId = Date.now();
      const seededTemplates: string[] = [];
      const seededApplicants: string[] = [];

      try {
        const templateId = await seedTemplate(api, {
          name: `E2E Defaults No Inquiry ${runId}`,
        });
        seededTemplates.push(templateId);

        const applicantId = await seedApplicant(api, {
          inquiry_id: null,
          legal_name: "No Inquiry Tenant",
        });
        seededApplicants.push(applicantId);

        const { status, body } = await getGenerateDefaults(
          api, templateId, applicantId,
        );
        expect(status).toBe(200);

        const defaults = body.defaults as Array<{
          key: string;
          value: string | null;
          provenance: string | null;
        }>;

        // Email only exists on inquiry — with no inquiry, should be null.
        const emailDefault = defaults.find((d) => d.key === "TENANT EMAIL");
        expect(emailDefault?.value).toBeNull();
        expect(emailDefault?.provenance).toBeNull();

        // Name resolves from applicant.
        const nameDefault = defaults.find((d) => d.key === "TENANT FULL NAME");
        expect(nameDefault?.value).toBe("No Inquiry Tenant");
        expect(nameDefault?.provenance).toBe("applicant");
      } finally {
        for (const id of seededTemplates) await deleteTemplate(api, id);
        for (const id of seededApplicants) await deleteApplicant(api, id);
      }
    },
  );

  test(
    "today placeholder resolves to today's date, provenance=today",
    async ({ api }) => {
      const runId = Date.now();
      const seededTemplates: string[] = [];
      const seededApplicants: string[] = [];

      try {
        const templateId = await seedTemplate(api, {
          name: `E2E Defaults Today ${runId}`,
        });
        seededTemplates.push(templateId);

        const applicantId = await seedApplicant(api, { legal_name: "Test Tenant" });
        seededApplicants.push(applicantId);

        const { status, body } = await getGenerateDefaults(
          api, templateId, applicantId,
        );
        expect(status).toBe(200);

        const effectiveDateDefault = (body.defaults as Array<{
          key: string;
          value: string | null;
          provenance: string | null;
        }>).find((d) => d.key === "EFFECTIVE DATE");

        const todayIso = new Date().toISOString().slice(0, 10);
        expect(effectiveDateDefault?.value).toBe(todayIso);
        expect(effectiveDateDefault?.provenance).toBe("today");
      } finally {
        for (const id of seededTemplates) await deleteTemplate(api, id);
        for (const id of seededApplicants) await deleteApplicant(api, id);
      }
    },
  );

  test(
    "cross-tenant applicant returns 404",
    async ({ api }) => {
      const runId = Date.now();
      const seededTemplates: string[] = [];

      try {
        const templateId = await seedTemplate(api, {
          name: `E2E Defaults Cross-Tenant ${runId}`,
        });
        seededTemplates.push(templateId);

        // Use a random UUID that definitely doesn't belong to this tenant.
        const fakeApplicantId = "00000000-0000-4000-8000-000000000001";
        const { status } = await getGenerateDefaults(
          api, templateId, fakeApplicantId,
        );
        expect(status).toBe(404);
      } finally {
        for (const id of seededTemplates) await deleteTemplate(api, id);
      }
    },
  );
});
