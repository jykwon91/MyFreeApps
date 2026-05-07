import { useEffect, useRef, useState } from "react";
import * as mammoth from "mammoth";

export interface AttachmentViewerDocxBodyProps {
  url: string;
  filename: string;
}

type DocxState =
  | { status: "loading" }
  | { status: "success"; html: string }
  | { status: "error"; message: string };

export default function AttachmentViewerDocxBody({
  url,
  filename,
}: AttachmentViewerDocxBodyProps) {
  const [state, setState] = useState<DocxState>({ status: "loading" });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    async function convert() {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const { value: html, messages } = await mammoth.convertToHtml({
          arrayBuffer,
        });
        if (messages.length > 0) {
          console.warn("[AttachmentViewerDocxBody] mammoth warnings:", messages);
        }
        if (!controller.signal.aborted) {
          setState({ status: "success", html });
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        const message =
          err instanceof Error ? err.message : "Unexpected error";
        setState({ status: "error", message });
      }
    }

    void convert();

    return () => {
      controller.abort();
    };
  }, [url]);

  if (state.status === "loading") {
    return (
      <div
        className="p-6 space-y-3 max-w-3xl mx-auto w-full"
        data-testid="attachment-viewer-docx-loading"
        aria-busy="true"
        aria-label="Loading document"
      >
        {/* Title line */}
        <div className="h-5 bg-muted rounded animate-pulse w-3/5" />
        {/* Paragraph lines */}
        <div className="space-y-2 pt-2">
          <div className="h-3.5 bg-muted rounded animate-pulse w-full" />
          <div className="h-3.5 bg-muted rounded animate-pulse w-full" />
          <div className="h-3.5 bg-muted rounded animate-pulse w-11/12" />
          <div className="h-3.5 bg-muted rounded animate-pulse w-4/5" />
        </div>
        <div className="space-y-2 pt-4">
          <div className="h-3.5 bg-muted rounded animate-pulse w-full" />
          <div className="h-3.5 bg-muted rounded animate-pulse w-10/12" />
          <div className="h-3.5 bg-muted rounded animate-pulse w-full" />
          <div className="h-3.5 bg-muted rounded animate-pulse w-9/12" />
        </div>
        <div className="space-y-2 pt-4">
          <div className="h-3.5 bg-muted rounded animate-pulse w-full" />
          <div className="h-3.5 bg-muted rounded animate-pulse w-full" />
          <div className="h-3.5 bg-muted rounded animate-pulse w-7/12" />
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div
        className="flex flex-col items-center justify-center h-full gap-3 px-4 text-center"
        data-testid="attachment-viewer-docx-error"
      >
        <p className="text-sm text-muted-foreground">
          Unable to preview this document.
        </p>
        <a
          href={url}
          download={filename}
          className="text-sm text-primary hover:underline font-medium"
          data-testid="attachment-viewer-docx-download-fallback"
        >
          Download {filename}
        </a>
      </div>
    );
  }

  return (
    <article
      className={[
        "mx-auto w-full max-w-3xl px-6 py-8",
        "text-sm leading-relaxed text-foreground",
        "[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4 [&_h1]:mt-6",
        "[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mb-3 [&_h2]:mt-5",
        "[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4",
        "[&_p]:mb-3",
        "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3",
        "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3",
        "[&_li]:mb-1",
        "[&_table]:w-full [&_table]:border-collapse [&_table]:mb-4",
        "[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:align-top",
        "[&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:font-semibold [&_th]:bg-muted",
        "[&_strong]:font-semibold",
        "[&_em]:italic",
      ].join(" ")}
      dangerouslySetInnerHTML={{ __html: state.html }}
      data-testid="attachment-viewer-docx-content"
    />
  );
}
