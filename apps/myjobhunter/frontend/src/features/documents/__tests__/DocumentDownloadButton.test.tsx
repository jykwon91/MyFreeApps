/** DocumentDownloadButton hands its document's fetch to the shared download hook. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { showError } from "@platform/ui";
import { DOCUMENT_DOWNLOAD_MESSAGES as MESSAGES } from "@/constants/document-download-messages";
import { useLazyGetDocumentDownloadUrlQuery } from "@myjobhunter/api-client/store/documentsApi";
import DocumentDownloadButton from "../DocumentDownloadButton";

vi.mock("@myjobhunter/api-client/store/documentsApi", () => ({
  useLazyGetDocumentDownloadUrlQuery: vi.fn(),
}));

vi.mock("@platform/ui", () => ({
  showError: vi.fn(),
  extractErrorMessage: (err: unknown) => String(err),
}));

function stubDownloadUrl(url: string) {
  const trigger = vi.fn().mockReturnValue({ unwrap: vi.fn().mockResolvedValue({ url }) });
  vi.mocked(useLazyGetDocumentDownloadUrlQuery).mockReturnValue(
    [trigger, {}, {}] as unknown as ReturnType<typeof useLazyGetDocumentDownloadUrlQuery>,
  );
  return trigger;
}

describe("DocumentDownloadButton", () => {
  const tab = { opener: {}, close: vi.fn(), location: { href: "" } };

  beforeEach(() => {
    vi.clearAllMocks();
    tab.location.href = "";
    vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
  });

  it("fetches the document's link and sends the opened tab to it", async () => {
    const trigger = stubDownloadUrl("https://files.example.com/doc.pdf");
    render(<DocumentDownloadButton documentId="doc-1" />);

    await userEvent.click(screen.getByRole("button", { name: "Download file" }));

    await waitFor(() => expect(tab.location.href).toBe("https://files.example.com/doc.pdf"));
    expect(trigger).toHaveBeenCalledWith("doc-1");
  });

  it("refuses a link that isn't http(s)", async () => {
    stubDownloadUrl("javascript:alert(1)");
    render(<DocumentDownloadButton documentId="doc-1" />);

    await userEvent.click(screen.getByRole("button", { name: "Download file" }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith(MESSAGES.unsafeLink));
    expect(tab.close).toHaveBeenCalled();
    expect(tab.location.href).toBe("");
  });
});
