/**
 * Unit tests for AttachmentViewer.
 *
 * Verifies:
 * - PDF shows iframe + "Open in new tab" link.
 * - Image shows <img> element.
 * - DOCX shows the loading skeleton while conversion is in progress.
 * - Other content types show the download fallback.
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AttachmentViewer from "@/app/features/leases/AttachmentViewer";

const BASE_PROPS = {
  url: "https://storage.example.com/presigned/test.pdf",
  filename: "lease.pdf",
  onClose: () => {},
};

// Panel uses createPortal which jsdom handles correctly when document.body exists.

describe("AttachmentViewer — PDF", () => {
  it("renders an iframe for application/pdf", () => {
    render(
      <AttachmentViewer
        {...BASE_PROPS}
        filename="lease.pdf"
        contentType="application/pdf"
      />,
    );

    const iframe = screen.getByTestId("attachment-viewer-iframe");
    expect(iframe).toBeInTheDocument();
    expect(iframe.getAttribute("src")).toBe(BASE_PROPS.url);

    const link = screen.getByTestId("attachment-viewer-open-in-new-tab");
    expect(link).toBeInTheDocument();
    expect(link.getAttribute("href")).toBe(BASE_PROPS.url);
    expect(link.getAttribute("target")).toBe("_blank");

    expect(screen.queryByTestId("attachment-viewer-img")).toBeNull();
    expect(screen.queryByTestId("attachment-viewer-download-fallback")).toBeNull();
  });
});

describe("AttachmentViewer — image", () => {
  it("renders an img for image/jpeg", () => {
    render(
      <AttachmentViewer
        {...BASE_PROPS}
        url="https://storage.example.com/presigned/photo.jpg"
        filename="photo.jpg"
        contentType="image/jpeg"
      />,
    );

    const img = screen.getByTestId("attachment-viewer-img");
    expect(img).toBeInTheDocument();
    expect(img.getAttribute("src")).toBe("https://storage.example.com/presigned/photo.jpg");

    expect(screen.queryByTestId("attachment-viewer-iframe")).toBeNull();
    expect(screen.queryByTestId("attachment-viewer-download-fallback")).toBeNull();
  });

  it("renders an img for image/png", () => {
    render(
      <AttachmentViewer
        {...BASE_PROPS}
        url="https://storage.example.com/presigned/scan.png"
        filename="scan.png"
        contentType="image/png"
      />,
    );

    expect(screen.getByTestId("attachment-viewer-img")).toBeInTheDocument();
  });
});

describe("AttachmentViewer — DOCX", () => {
  beforeEach(() => {
    // fetch is called inside useEffect; suppress jsdom fetch errors by
    // returning a rejected promise (the component handles this as "error" state).
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("fetch not available in jsdom"))));
  });

  it("renders the DOCX loading skeleton immediately on mount", () => {
    render(
      <AttachmentViewer
        {...BASE_PROPS}
        url="https://storage.example.com/presigned/lease.docx"
        filename="lease.docx"
        contentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      />,
    );

    // The skeleton should be present immediately (before the async fetch resolves)
    expect(screen.getByTestId("attachment-viewer-docx-loading")).toBeInTheDocument();

    // Should NOT show the generic download fallback or an iframe
    expect(screen.queryByTestId("attachment-viewer-download-fallback")).toBeNull();
    expect(screen.queryByTestId("attachment-viewer-iframe")).toBeNull();
    expect(screen.queryByTestId("attachment-viewer-img")).toBeNull();
  });

  it("still shows the 'Open in new tab' link for DOCX", () => {
    render(
      <AttachmentViewer
        {...BASE_PROPS}
        url="https://storage.example.com/presigned/lease.docx"
        filename="lease.docx"
        contentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      />,
    );

    const link = screen.getByTestId("attachment-viewer-open-in-new-tab");
    expect(link).toBeInTheDocument();
    expect(link.getAttribute("href")).toBe("https://storage.example.com/presigned/lease.docx");
  });
});

describe("AttachmentViewer — other content types", () => {
  it("shows download fallback for non-previewable content type", () => {
    render(
      <AttachmentViewer
        {...BASE_PROPS}
        url="https://storage.example.com/presigned/notes.txt"
        filename="notes.txt"
        contentType="text/plain"
      />,
    );

    const fallback = screen.getByTestId("attachment-viewer-download-fallback");
    expect(fallback).toBeInTheDocument();
    expect(fallback.textContent).toMatch(/cannot be previewed/i);

    expect(screen.queryByTestId("attachment-viewer-iframe")).toBeNull();
    expect(screen.queryByTestId("attachment-viewer-img")).toBeNull();
  });
});
