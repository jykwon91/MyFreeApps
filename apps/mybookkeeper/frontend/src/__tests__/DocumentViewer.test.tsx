/**
 * Unit tests for DocumentViewer covering the failure modes that the
 * 2026-04-30 user report ("i still can't see the source documents")
 * went undiagnosed for. Earlier E2E coverage stopped at the panel header
 * being visible, which passed even when the iframe content was blank.
 *
 * These tests verify that:
 * - A successful PDF load shows the iframe + an "Open in new tab" link.
 * - A 0-byte response shows a clear empty-state message (the most likely
 *   failure mode where the backend returns 200 with no content).
 * - A request error surfaces the underlying error message.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import DocumentViewer from "@/app/features/documents/DocumentViewer";

const fetchDocumentBlobMock = vi.fn();

vi.mock("@/shared/services/documentService", () => ({
  fetchDocumentBlob: (id: string) => fetchDocumentBlobMock(id),
}));

// jsdom doesn't implement createObjectURL/revokeObjectURL.
beforeEach(() => {
  // Each test sets its own resolved/rejected mock value.
  fetchDocumentBlobMock.mockReset();
  if (!("createObjectURL" in URL)) {
    Object.defineProperty(URL, "createObjectURL", {
      writable: true,
      value: vi.fn(() => "blob:mock-url"),
    });
  }
  if (!("revokeObjectURL" in URL)) {
    Object.defineProperty(URL, "revokeObjectURL", {
      writable: true,
      value: vi.fn(),
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DocumentViewer — successful PDF render", () => {
  it("shows the iframe and an 'Open in new tab' link when the blob has content", async () => {
    fetchDocumentBlobMock.mockResolvedValue({
      url: "blob:abc",
      contentType: "application/pdf",
      size: 1989,
    });

    render(<DocumentViewer documentId="doc-1" onClose={() => {}} />);

    const iframe = await screen.findByTitle("Source document");
    expect(iframe).toBeInTheDocument();
    expect(iframe.getAttribute("src")).toBe("blob:abc");

    const link = screen.getByTestId("document-open-in-new-tab");
    expect(link).toBeInTheDocument();
    expect(link.getAttribute("href")).toBe("blob:abc");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");

    expect(screen.queryByTestId("document-empty")).toBeNull();
    expect(screen.queryByTestId("document-error")).toBeNull();
  });
});

describe("DocumentViewer — empty response (size === 0)", () => {
  it("shows the empty-state message when the backend returns a zero-byte body", async () => {
    fetchDocumentBlobMock.mockResolvedValue({
      url: "blob:empty",
      contentType: "application/pdf",
      size: 0,
    });

    render(<DocumentViewer documentId="doc-empty" onClose={() => {}} />);

    const empty = await screen.findByTestId("document-empty");
    expect(empty).toBeInTheDocument();
    expect(empty.textContent).toMatch(/no content available/i);
    expect(empty.textContent).toMatch(/re-uploading/i);

    // The iframe MUST NOT render for an empty blob — that was the silent
    // failure mode users were seeing in production.
    expect(screen.queryByTitle("Source document")).toBeNull();

    // No "Open in new tab" link for an empty document.
    expect(screen.queryByTestId("document-open-in-new-tab")).toBeNull();
  });
});

describe("DocumentViewer — request error", () => {
  it("surfaces the error message when the download request fails", async () => {
    fetchDocumentBlobMock.mockRejectedValue(new Error("Request failed with status code 404"));

    render(<DocumentViewer documentId="doc-missing" onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByTestId("document-error")).toBeInTheDocument();
    });
    expect(screen.getByTestId("document-error").textContent).toMatch(/404/);

    // No iframe, no fallback link.
    expect(screen.queryByTitle("Source document")).toBeNull();
    expect(screen.queryByTestId("document-open-in-new-tab")).toBeNull();
  });
});
