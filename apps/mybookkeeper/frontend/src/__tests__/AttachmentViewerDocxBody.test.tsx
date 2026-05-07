/**
 * Unit tests for AttachmentViewerDocxBody.
 *
 * Verifies:
 * - Loading skeleton renders immediately on mount before fetch resolves.
 * - Converted HTML renders when mammoth succeeds.
 * - Error state with download fallback link renders when mammoth throws.
 * - Error state with download fallback renders when fetch fails.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import AttachmentViewerDocxBody from "@/app/features/leases/AttachmentViewerDocxBody";

const DOCX_URL = "https://storage.example.com/presigned/lease.docx";
const FILENAME = "lease.docx";

// Hoist mammoth mock to file top level (vi.mock is hoisted by Vitest regardless of placement)
vi.mock("mammoth", () => ({
  convertToHtml: vi.fn(),
}));

// Helper: build a minimal ArrayBuffer
function fakeArrayBuffer(): ArrayBuffer {
  return new ArrayBuffer(8);
}

// Helper: fetch resolves successfully with a fake ArrayBuffer
function stubFetchSuccess() {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(fakeArrayBuffer()),
      } as Response),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("AttachmentViewerDocxBody — loading state", () => {
  beforeEach(() => {
    // Keep fetch pending indefinitely so the loading skeleton stays visible
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
  });

  it("renders the skeleton immediately before fetch resolves", () => {
    render(<AttachmentViewerDocxBody url={DOCX_URL} filename={FILENAME} />);

    expect(screen.getByTestId("attachment-viewer-docx-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("attachment-viewer-docx-content")).toBeNull();
    expect(screen.queryByTestId("attachment-viewer-docx-error")).toBeNull();
  });
});

describe("AttachmentViewerDocxBody — success state", () => {
  it("renders converted HTML when mammoth succeeds", async () => {
    const html = "<p>This is the lease content.</p><p>Section 2 text.</p>";

    stubFetchSuccess();

    // Configure the hoisted mock to return controlled HTML
    const mammoth = await import("mammoth");
    vi.mocked(mammoth.convertToHtml).mockResolvedValue({
      value: html,
      messages: [],
    });

    render(<AttachmentViewerDocxBody url={DOCX_URL} filename={FILENAME} />);

    // Skeleton appears first
    expect(screen.getByTestId("attachment-viewer-docx-loading")).toBeInTheDocument();

    // After conversion completes, content should appear
    const content = await screen.findByTestId("attachment-viewer-docx-content");
    expect(content).toBeInTheDocument();
    expect(content.innerHTML).toContain("lease content");
    expect(content.innerHTML).toContain("Section 2 text");

    expect(screen.queryByTestId("attachment-viewer-docx-loading")).toBeNull();
    expect(screen.queryByTestId("attachment-viewer-docx-error")).toBeNull();
  });

  it("still renders content when mammoth emits warnings", async () => {
    const html = "<p>Content with warnings.</p>";

    stubFetchSuccess();

    const mammoth = await import("mammoth");
    vi.mocked(mammoth.convertToHtml).mockResolvedValue({
      value: html,
      messages: [{ type: "warning" as const, message: "Unsupported element" }],
    });

    render(<AttachmentViewerDocxBody url={DOCX_URL} filename={FILENAME} />);

    const content = await screen.findByTestId("attachment-viewer-docx-content");
    expect(content).toBeInTheDocument();
    expect(content.innerHTML).toContain("Content with warnings");
  });
});

describe("AttachmentViewerDocxBody — error state (fetch fails)", () => {
  it("shows error state with download fallback when fetch rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("Network error"))),
    );

    render(<AttachmentViewerDocxBody url={DOCX_URL} filename={FILENAME} />);

    // Wait for error state to appear
    await waitFor(() => {
      expect(screen.queryByTestId("attachment-viewer-docx-loading")).toBeNull();
    });

    expect(screen.getByTestId("attachment-viewer-docx-error")).toBeInTheDocument();

    const downloadLink = screen.getByTestId("attachment-viewer-docx-download-fallback");
    expect(downloadLink).toBeInTheDocument();
    expect(downloadLink.getAttribute("href")).toBe(DOCX_URL);
    expect(downloadLink.getAttribute("download")).toBe(FILENAME);
    expect(downloadLink.textContent).toContain(FILENAME);

    expect(screen.queryByTestId("attachment-viewer-docx-content")).toBeNull();
  });

  it("shows error state when fetch returns non-ok status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 403,
          arrayBuffer: () => Promise.resolve(fakeArrayBuffer()),
        } as Response),
      ),
    );

    render(<AttachmentViewerDocxBody url={DOCX_URL} filename={FILENAME} />);

    await waitFor(() => {
      expect(screen.queryByTestId("attachment-viewer-docx-loading")).toBeNull();
    });

    expect(screen.getByTestId("attachment-viewer-docx-error")).toBeInTheDocument();
    expect(screen.getByTestId("attachment-viewer-docx-download-fallback")).toBeInTheDocument();
  });
});

describe("AttachmentViewerDocxBody — error state (mammoth fails)", () => {
  it("shows error state with download fallback when mammoth throws", async () => {
    stubFetchSuccess();

    const mammoth = await import("mammoth");
    vi.mocked(mammoth.convertToHtml).mockRejectedValue(
      new Error("Not a valid DOCX file"),
    );

    render(<AttachmentViewerDocxBody url={DOCX_URL} filename={FILENAME} />);

    await waitFor(() => {
      expect(screen.queryByTestId("attachment-viewer-docx-loading")).toBeNull();
    });

    expect(screen.getByTestId("attachment-viewer-docx-error")).toBeInTheDocument();
    expect(screen.getByTestId("attachment-viewer-docx-download-fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("attachment-viewer-docx-content")).toBeNull();
  });
});
