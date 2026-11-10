import { test, expect, type APIRequestContext } from "./fixtures/auth";
import { deleteApplicant } from "./fixtures/applicants";
import { deleteSignedLease } from "./fixtures/signed-leases";
import { deleteTemplate } from "./fixtures/lease-templates";

/**
 * A sent or signed lease keeps the documents it was generated with: asking to
 * make a linked template's document again (or to generate the lease again) is
 * refused with a 409 and changes nothing, the picker disables that template,
 * and adding a brand-new template still works.
 */

const TODAY = new Date().toISOString().slice(0, 10);

interface LeaseView {
  status: string;
  documents_locked: boolean;
  templates: Array<{ id: string }>;
  attachments: Array<{ id: string; kind: string; is_locked: boolean }>;
}

async function seedId(api: APIRequestContext, path: string, data: Record<string, unknown>): Promise<string> {
  const res = await api.post(path, { data });
  if (!res.ok()) throw new Error(`${path} failed: ${res.status()} ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}

async function getLease(api: APIRequestContext, id: string): Promise<LeaseView> {
  const res = await api.get(`/signed-leases/${id}`);
  expect(res.ok()).toBe(true);
  return (await res.json()) as LeaseView;
}

function renderedIds(lease: LeaseView): string[] {
  return lease.attachments.filter((a) => a.kind === "rendered_original").map((a) => a.id).sort();
}

async function addTemplates(api: APIRequestContext, leaseId: string, templateIds: string[]) {
  return api.post(`/signed-leases/${leaseId}/templates`, { data: { template_ids: templateIds, today: TODAY } });
}

async function leaseWithTemplate(api: APIRequestContext, runId: number) {
  const applicantId = await seedId(api, "/test/seed-applicant", { legal_name: `E2E Locked ${runId}`, stage: "lease_signed" });
  const linkedId = await seedId(api, "/test/seed-lease-template", { name: `E2E Linked ${runId}`, source_text: "Lease for [TENANT FULL NAME]\n" });
  const newId = await seedId(api, "/test/seed-lease-template", { name: `E2E New ${runId}`, source_text: "Addendum for [TENANT FULL NAME]\n" });
  const leaseId = await seedId(api, "/test/seed-signed-lease", { applicant_id: applicantId, kind: "imported", status: "draft", attachments: [{ filename: "orig.pdf", kind: "other" }] });
  expect((await addTemplates(api, leaseId, [linkedId])).status()).toBe(200);
  return { applicantId, linkedId, newId, leaseId };
}

async function setStatus(api: APIRequestContext, leaseId: string, status: string): Promise<void> {
  const res = await api.patch(`/signed-leases/${leaseId}`, { data: { status } });
  expect(res.ok()).toBe(true);
}

const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

async function upload(api: APIRequestContext, leaseId: string, kind: string) {
  return api.post(`/signed-leases/${leaseId}/attachments`, {
    multipart: { kind, file: { name: `${kind}.pdf`, mimeType: "application/pdf", buffer: PDF_BYTES } },
  });
}

test.describe("Lease — documents locked once sent or signed", () => {
  test("UI: adding a new template to a signed lease adds a document and leaves the old one untouched", async ({ authedPage: page, api }) => {
    const runId = Date.now();
    const seeded = await leaseWithTemplate(api, runId);
    try {
      await setStatus(api, seeded.leaseId, "generated");
      await setStatus(api, seeded.leaseId, "signed");
      const before = await getLease(api, seeded.leaseId);
      const beforeOriginals = renderedIds(before);
      expect(beforeOriginals).toHaveLength(1);

      await page.goto(`/leases/${seeded.leaseId}`);
      await page.getByTestId("lease-add-template-button").click();
      await page.getByTestId(`add-template-checkbox-${seeded.newId}`).check();
      await page.getByTestId("lease-add-template-continue").click();
      await page.getByTestId("lease-add-template-confirm").click();
      await expect(page.getByText("Document added.", { exact: true })).toBeVisible();

      const after = await getLease(api, seeded.leaseId);
      expect(after.status).toBe("signed");
      expect(renderedIds(after)).toHaveLength(2);
      expect(renderedIds(after)).toEqual(expect.arrayContaining(beforeOriginals));
    } finally {
      await deleteSignedLease(api, seeded.leaseId);
      await deleteTemplate(api, seeded.linkedId);
      await deleteTemplate(api, seeded.newId);
      await deleteApplicant(api, seeded.applicantId);
    }
  });

  test("API and UI: an original on a signed lease can't be deleted or relabelled", async ({ authedPage: page, api }) => {
    const runId = Date.now();
    const seeded = await leaseWithTemplate(api, runId);
    try {
      await setStatus(api, seeded.leaseId, "generated");
      await setStatus(api, seeded.leaseId, "signed");
      const [originalId] = renderedIds(await getLease(api, seeded.leaseId));

      const del = await api.delete(`/signed-leases/${seeded.leaseId}/attachments/${originalId}`);
      expect(del.status()).toBe(409);
      expect(((await del.json()) as { detail: { code: string } }).detail.code).toBe("LEASE_ATTACHMENT_LOCKED");

      const relabel = await api.patch(`/signed-leases/${seeded.leaseId}/attachments/${originalId}`, { data: { kind: "other" } });
      expect(relabel.status()).toBe(409);

      expect(renderedIds(await getLease(api, seeded.leaseId))).toEqual([originalId]);

      await page.goto(`/leases/${seeded.leaseId}`);
      await expect(page.getByTestId(`lease-attachment-locked-${originalId}`)).toBeVisible();
      await expect(page.getByTestId(`lease-attachment-kind-picker-${originalId}`)).toHaveCount(0);
      await expect(page.locator(`[data-testid="lease-attachment-${originalId}"] button[aria-label^="Delete"]`)).toHaveCount(0);
    } finally {
      await deleteSignedLease(api, seeded.leaseId);
      await deleteTemplate(api, seeded.linkedId);
      await deleteTemplate(api, seeded.newId);
      await deleteApplicant(api, seeded.applicantId);
    }
  });

  test("API: re-picking a linked template or generating is refused, adding a new template is not", async ({ api }) => {
    const runId = Date.now();
    const seeded = await leaseWithTemplate(api, runId);
    try {
      await setStatus(api, seeded.leaseId, "generated");
      await setStatus(api, seeded.leaseId, "signed");
      const before = renderedIds(await getLease(api, seeded.leaseId));
      expect(before).toHaveLength(1);

      const repick = await addTemplates(api, seeded.leaseId, [seeded.linkedId]);
      expect(repick.status()).toBe(409);
      expect(((await repick.json()) as { detail: { code: string } }).detail.code).toBe("LEASE_DOCUMENTS_LOCKED");

      const generate = await api.post(`/signed-leases/${seeded.leaseId}/generate`, { data: { today: TODAY } });
      expect(generate.status()).toBe(409);
      expect(((await generate.json()) as { detail: { code: string } }).detail.code).toBe("LEASE_DOCUMENTS_LOCKED");

      const unchanged = await getLease(api, seeded.leaseId);
      expect(unchanged.status).toBe("signed");
      expect(renderedIds(unchanged)).toEqual(before);

      const addNew = await addTemplates(api, seeded.leaseId, [seeded.newId]);
      expect(addNew.status()).toBe(200);
      const after = await getLease(api, seeded.leaseId);
      expect(after.templates).toHaveLength(2);
      expect(renderedIds(after)).toHaveLength(2);
      expect(renderedIds(after)).toEqual(expect.arrayContaining(before));
    } finally {
      await deleteSignedLease(api, seeded.leaseId);
      await deleteTemplate(api, seeded.linkedId);
      await deleteTemplate(api, seeded.newId);
      await deleteApplicant(api, seeded.applicantId);
    }
  });

  test("UI: the picker disables a template already on a signed lease, with the reason", async ({ authedPage: page, api }) => {
    const runId = Date.now();
    const seeded = await leaseWithTemplate(api, runId);
    try {
      await setStatus(api, seeded.leaseId, "generated");
      await setStatus(api, seeded.leaseId, "signed");

      await page.goto(`/leases/${seeded.leaseId}`);
      await page.getByTestId("lease-add-template-button").click();

      await expect(page.getByTestId(`add-template-checkbox-${seeded.linkedId}`)).toBeDisabled();
      await expect(page.getByTestId(`add-template-locked-${seeded.linkedId}`)).toBeVisible();
      await expect(page.getByTestId(`add-template-checkbox-${seeded.newId}`)).toBeEnabled();
    } finally {
      await deleteSignedLease(api, seeded.leaseId);
      await deleteTemplate(api, seeded.linkedId);
      await deleteTemplate(api, seeded.newId);
      await deleteApplicant(api, seeded.applicantId);
    }
  });

  test("UI: a generated lease can still re-pick its linked template", async ({ authedPage: page, api }) => {
    const runId = Date.now();
    const seeded = await leaseWithTemplate(api, runId);
    try {
      await setStatus(api, seeded.leaseId, "generated");

      await page.goto(`/leases/${seeded.leaseId}`);
      await page.getByTestId("lease-add-template-button").click();

      await expect(page.getByTestId(`add-template-checkbox-${seeded.linkedId}`)).toBeEnabled();
      await expect(page.getByTestId(`add-template-locked-${seeded.linkedId}`)).toHaveCount(0);
    } finally {
      await deleteSignedLease(api, seeded.leaseId);
      await deleteTemplate(api, seeded.linkedId);
      await deleteTemplate(api, seeded.newId);
      await deleteApplicant(api, seeded.applicantId);
    }
  });

  test("API and UI: a locked lease takes signed copies but no new original, the first signed copy stays and a later one can be undone", async ({ authedPage: page, api }) => {
    const runId = Date.now();
    const seeded = await leaseWithTemplate(api, runId);
    try {
      await setStatus(api, seeded.leaseId, "generated");
      await setStatus(api, seeded.leaseId, "sent");
      expect((await getLease(api, seeded.leaseId)).documents_locked).toBe(true);

      const original = await upload(api, seeded.leaseId, "rendered_original");
      expect(original.status()).toBe(409);
      expect(((await original.json()) as { detail: { code: string } }).detail.code).toBe("LEASE_ATTACHMENT_LOCKED");

      const first = await upload(api, seeded.leaseId, "signed_lease");
      expect(first.status()).toBe(201);
      const firstId = ((await first.json()) as { id: string }).id;
      expect((await api.delete(`/signed-leases/${seeded.leaseId}/attachments/${firstId}`)).status()).toBe(409);

      const signed = await upload(api, seeded.leaseId, "signed_lease");
      expect(signed.status()).toBe(201);
      const signedId = ((await signed.json()) as { id: string }).id;
      expect(renderedIds(await getLease(api, seeded.leaseId))).toHaveLength(1);

      await page.goto(`/leases/${seeded.leaseId}`);
      await expect(page.getByTestId("lease-attachment-kind-select").locator("option")).not.toContainText(["Rendered original"]);
      await expect(page.getByTestId(`lease-attachment-kind-picker-${signedId}`)).toBeVisible();

      const del = await api.delete(`/signed-leases/${seeded.leaseId}/attachments/${signedId}`);
      expect(del.status()).toBe(204);
    } finally {
      await deleteSignedLease(api, seeded.leaseId);
      await deleteTemplate(api, seeded.linkedId);
      await deleteTemplate(api, seeded.newId);
      await deleteApplicant(api, seeded.applicantId);
    }
  });

  test("API: a generated lease takes its signed copy, then moves to sent and signed", async ({ api }) => {
    const runId = Date.now();
    const seeded = await leaseWithTemplate(api, runId);
    try {
      await setStatus(api, seeded.leaseId, "generated");
      expect((await upload(api, seeded.leaseId, "signed_lease")).status()).toBe(201);
      await setStatus(api, seeded.leaseId, "sent");
      await setStatus(api, seeded.leaseId, "signed");

      const lease = await getLease(api, seeded.leaseId);
      expect(lease.status).toBe("signed");
      expect(lease.documents_locked).toBe(true);
      expect(lease.attachments.filter((a) => a.kind === "signed_lease")).toHaveLength(1);
    } finally {
      await deleteSignedLease(api, seeded.leaseId);
      await deleteTemplate(api, seeded.linkedId);
      await deleteTemplate(api, seeded.newId);
      await deleteApplicant(api, seeded.applicantId);
    }
  });

  test("API: the only signature on a generated lease cannot be cleared, so Regenerate cannot reach the signed original", async ({ api }) => {
    const runId = Date.now();
    const seeded = await leaseWithTemplate(api, runId);
    try {
      await setStatus(api, seeded.leaseId, "generated");
      const original = renderedIds(await getLease(api, seeded.leaseId))[0];
      const signingState = `/signed-leases/${seeded.leaseId}/attachments/${original}/signing-state`;

      const signed = await api.patch(signingState, { data: { signed_by_tenant_at: new Date().toISOString() } });
      expect(signed.status()).toBe(200);
      expect(((await signed.json()) as { is_locked: boolean }).is_locked).toBe(true);

      const cleared = await api.patch(signingState, { data: { signed_by_tenant_at: null } });
      expect(cleared.status()).toBe(409);
      expect(((await cleared.json()) as { detail: { code: string } }).detail.code).toBe("LEASE_ATTACHMENT_LOCKED");
      expect((await getLease(api, seeded.leaseId)).documents_locked).toBe(true);
    } finally {
      await deleteSignedLease(api, seeded.leaseId);
      await deleteTemplate(api, seeded.linkedId);
      await deleteTemplate(api, seeded.newId);
      await deleteApplicant(api, seeded.applicantId);
    }
  });

  test("API: values can't be edited once the lease is sent", async ({ api }) => {
    const runId = Date.now();
    const seeded = await leaseWithTemplate(api, runId);
    try {
      await setStatus(api, seeded.leaseId, "generated");
      await setStatus(api, seeded.leaseId, "sent");
      const res = await api.patch(`/signed-leases/${seeded.leaseId}`, { data: { values: { RENT: "1" } } });
      expect(res.status()).toBeGreaterThanOrEqual(400);
      expect(res.status()).toBeLessThan(500);
    } finally {
      await deleteSignedLease(api, seeded.leaseId);
      await deleteTemplate(api, seeded.linkedId);
      await deleteTemplate(api, seeded.newId);
      await deleteApplicant(api, seeded.applicantId);
    }
  });
});
