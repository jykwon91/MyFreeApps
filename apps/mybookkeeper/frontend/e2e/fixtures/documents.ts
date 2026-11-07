import { expect, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "fs";
import JSZip from "jszip";
import path from "path";
import { fileURLToPath } from "url";
import type { DocumentType } from "./document-type";

const SOURCE_PDF = path.join(path.dirname(fileURLToPath(import.meta.url)), "documents", "plumber-invoice.pdf");

/**
 * The fixture invoice under ``name``. Upload dedups on content hash, so a
 * trailing PDF comment makes the bytes unique too; otherwise the upload hands
 * back another test's copy.
 */
export function uniquePdf(name: string) {
  return {
    name,
    mimeType: "application/pdf",
    buffer: Buffer.concat([readFileSync(SOURCE_PDF), Buffer.from(`\n% ${name}\n`)]),
  };
}

/** A zip of ``uniquePdf`` copies under ``entryNames``, uploaded as one batch. */
export async function uniqueZip(name: string, entryNames: readonly string[]) {
  const zip = new JSZip();
  for (const entry of entryNames) zip.file(entry, uniquePdf(entry).buffer);
  return { name, mimeType: "application/zip", buffer: await zip.generateAsync({ type: "nodebuffer" }) };
}

/**
 * Uploads ``uniquePdf(name)`` and waits for extraction to end, since the
 * Documents list leaves out documents still being read. Ends "failed" on a
 * stack with no Anthropic key, "completed" on one with a key.
 */
export async function seedDocument(api: APIRequestContext, name: string): Promise<string> {
  const res = await api.post("/documents/upload", { multipart: { file: uniquePdf(name) } });
  expect(res.ok(), await res.text()).toBe(true);
  const { document_id: id, duplicate } = (await res.json()) as { document_id: string; duplicate?: boolean };
  expect(duplicate, `${name} matched an existing upload`).toBeFalsy();
  await expect
    .poll(
      async () => {
        const status = await api.get(`/documents/upload-status/${id}`);
        return status.ok() ? ((await status.json()) as { status: string }).status : `HTTP ${status.status()}`;
      },
      { timeout: 60000 },
    )
    .toMatch(/^(completed|failed)$/);
  return id;
}

export async function docIdsNamed(api: APIRequestContext, prefix: string): Promise<string[]> {
  const res = await api.get("/documents");
  expect(res.ok(), await res.text()).toBe(true);
  const docs = (await res.json()) as Array<{ id: string; file_name: string | null }>;
  return docs.filter((d) => d.file_name?.startsWith(prefix)).map((d) => d.id);
}

export async function deleteDocumentsNamed(api: APIRequestContext, prefix: string): Promise<void> {
  for (const id of await docIdsNamed(api, prefix)) {
    const del = await api.delete(`/documents/${id}`);
    expect(del.ok(), `cleanup: delete document ${id}`).toBe(true);
  }
}

/**
 * Adds a read document of ``documentType`` under ``name`` through the test-only
 * seed route. Extraction is what sets a type, and a keyless stack can't extract.
 */
export async function seedTypedDocument(api: APIRequestContext, name: string, documentType: DocumentType): Promise<string> {
  const res = await api.post("/test/seed-document", { data: { file_name: name, document_type: documentType } });
  expect(res.ok(), await res.text()).toBe(true);
  return ((await res.json()) as { id: string }).id;
}

/**
 * Adds a document whose reading failed under ``name`` through the test-only
 * seed route, so a spec gets a failure on a keyed stack as well as a keyless one.
 */
export async function seedFailedDocument(api: APIRequestContext, name: string): Promise<string> {
  const res = await api.post("/test/seed-failed-document", {
    data: { file_name: name, error_message: "E2E: this document could not be read" },
  });
  expect(res.ok(), await res.text()).toBe(true);
  return ((await res.json()) as { id: string }).id;
}
