/**
 * useFileDownload: opens the tab inside the click, navigates it to an http(s) link, and closes it
 * (with an error toast) when the fetch fails or the link isn't a web address.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { showError } from "@platform/ui";
import { DOCUMENT_DOWNLOAD_MESSAGES as MESSAGES } from "@/constants/document-download-messages";
import { useFileDownload } from "../useFileDownload";

vi.mock("@platform/ui", () => ({
  showError: vi.fn(),
  extractErrorMessage: (err: unknown) => String(err),
}));

interface FakeTab {
  opener: unknown;
  close: ReturnType<typeof vi.fn>;
  location: { href: string };
}

let tab: FakeTab;
let openSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  tab = { opener: {}, close: vi.fn(), location: { href: "" } };
  openSpy = vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
});

afterEach(() => {
  openSpy.mockRestore();
});

describe("useFileDownload", () => {
  it("opens the tab before the fetch settles, then sends it to the link", async () => {
    let resolveUrl: (value: { url: string }) => void = () => {};
    const fetchUrl = vi.fn(() => new Promise<{ url: string }>((resolve) => { resolveUrl = resolve; }));
    const { result } = renderHook(() => useFileDownload(fetchUrl));

    let pending: Promise<void> = Promise.resolve();
    act(() => { pending = result.current.download("file-1"); });

    expect(openSpy).toHaveBeenCalledWith("", "_blank");
    expect(tab.opener).toBeNull();
    expect(result.current.downloadingId).toBe("file-1");

    await act(async () => {
      resolveUrl({ url: "https://files.example.com/a.pdf" });
      await pending;
    });

    expect(fetchUrl).toHaveBeenCalledWith("file-1");
    expect(tab.location.href).toBe("https://files.example.com/a.pdf");
    expect(tab.close).not.toHaveBeenCalled();
    expect(result.current.downloadingId).toBeNull();
  });

  it("refuses a link that isn't http(s): closes the tab and shows the error", async () => {
    const { result } = renderHook(() => useFileDownload(async () => ({ url: "javascript:alert(1)" })));

    await act(async () => { await result.current.download("file-1"); });

    expect(tab.location.href).toBe("");
    expect(tab.close).toHaveBeenCalledOnce();
    expect(showError).toHaveBeenCalledWith(MESSAGES.unsafeLink);
  });

  it("closes the tab and shows the reason when the fetch fails", async () => {
    const { result } = renderHook(() => useFileDownload(async () => { throw new Error("boom"); }));

    await act(async () => { await result.current.download("file-1"); });

    expect(tab.close).toHaveBeenCalledOnce();
    expect(showError).toHaveBeenCalledWith(MESSAGES.failed("Error: boom"));
    expect(result.current.downloadingId).toBeNull();
  });

  it("navigates the current tab when the popup is blocked", async () => {
    openSpy.mockReturnValue(null);
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, assign } });
    try {
      const { result } = renderHook(() => useFileDownload(async () => ({ url: "https://files.example.com/a.pdf" })));
      await act(async () => { await result.current.download("file-1"); });
      expect(assign).toHaveBeenCalledWith("https://files.example.com/a.pdf");
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: original });
    }
  });

  it("ignores a second press while one download is in flight", async () => {
    let resolveUrl: (value: { url: string }) => void = () => {};
    const fetchUrl = vi.fn(() => new Promise<{ url: string }>((resolve) => { resolveUrl = resolve; }));
    const { result } = renderHook(() => useFileDownload(fetchUrl));

    let first: Promise<void> = Promise.resolve();
    act(() => { first = result.current.download("file-1"); });
    await act(async () => { await result.current.download("file-2"); });

    expect(fetchUrl).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveUrl({ url: "https://files.example.com/a.pdf" });
      await first;
    });
  });
});
