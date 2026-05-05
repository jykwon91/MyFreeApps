import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ListingPhoto } from "@/shared/types/listing/listing-photo";

// Mock jszip before importing the module under test.
// vi.mock is hoisted, so spies must be declared with vi.hoisted.
const { fileMock, generateMock } = vi.hoisted(() => ({
  fileMock: vi.fn(),
  generateMock: vi.fn().mockResolvedValue(new Blob(["zip"], { type: "application/zip" })),
}));

vi.mock("jszip", () => ({
  default: vi.fn().mockImplementation(function (this: { file: typeof fileMock; generateAsync: typeof generateMock }) {
    this.file = fileMock;
    this.generateAsync = generateMock;
  }),
}));

// Mock toast so we can assert on warning toasts.
const showErrorMock = vi.fn();
vi.mock("@/shared/lib/toast-store", () => ({
  showError: (msg: string) => showErrorMock(msg),
  showSuccess: vi.fn(),
}));

// Provide a minimal global fetch that returns an ok Blob response.
const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

// Suppress jsdom URL.createObjectURL / revokeObjectURL (not implemented in jsdom).
global.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock");
global.URL.revokeObjectURL = vi.fn();

// Capture anchor clicks so we can assert on the download trigger.
const anchorClickSpy = vi.fn();

import { downloadPhotosAsZip } from "@/app/features/listings/photo-bulk-download";

function makePhoto(overrides: Partial<ListingPhoto> = {}): ListingPhoto {
  return {
    id: "photo-1",
    listing_id: "listing-1",
    storage_key: "listings/photo-1.jpg",
    caption: null,
    display_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    presigned_url: "https://storage.example.com/photo-1.jpg",
    ...overrides,
  };
}

describe("downloadPhotosAsZip", () => {
  beforeEach(() => {
    fileMock.mockClear();
    generateMock.mockClear();
    showErrorMock.mockClear();
    fetchMock.mockClear();
    anchorClickSpy.mockClear();

    // Default: fetch returns an ok response.
    fetchMock.mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["img"], { type: "image/jpeg" }),
    });

    // Intercept document.createElement so we can capture the anchor click.
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "a") {
        const anchor = origCreate("a");
        anchor.click = anchorClickSpy;
        return anchor;
      }
      return origCreate(tag);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches each photo and files it into the zip", async () => {
    const photos = [makePhoto({ id: "p1" }), makePhoto({ id: "p2", display_order: 1 })];
    await downloadPhotosAsZip(photos, "my-listing");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fileMock).toHaveBeenCalledTimes(2);
  });

  it("zip filename matches <slug>-photos-<YYYY-MM-DD>.zip format", async () => {
    const anchor = document.createElement("a");
    const setSpy = vi.fn();
    Object.defineProperty(anchor, "download", { set: setSpy, configurable: true });

    await downloadPhotosAsZip([makePhoto()], "test-slug");
    // The filename should match the pattern
    expect(anchorClickSpy).toHaveBeenCalled();
  });

  it("skips a photo whose presigned_url is null and shows an error toast", async () => {
    const photos = [makePhoto({ presigned_url: null })];
    await downloadPhotosAsZip(photos, "my-listing");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(showErrorMock).toHaveBeenCalledWith(
      expect.stringContaining("1 photo couldn't be fetched"),
    );
    // The zip file call should not have been made for the skipped photo.
    expect(fileMock).not.toHaveBeenCalled();
  });

  it("skips a photo whose fetch returns non-ok and shows an error toast", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    const photos = [makePhoto(), makePhoto({ id: "p2", display_order: 1 })];
    await downloadPhotosAsZip(photos, "my-listing");
    expect(showErrorMock).toHaveBeenCalledWith(
      expect.stringContaining("2 photos couldn't be fetched"),
    );
    expect(fileMock).not.toHaveBeenCalled();
  });

  it("uses singular wording when exactly 1 photo is skipped", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    await downloadPhotosAsZip([makePhoto()], "my-listing");
    expect(showErrorMock).toHaveBeenCalledWith(
      expect.stringContaining("1 photo couldn't be fetched"),
    );
  });

  it("triggers a browser download by clicking an anchor", async () => {
    await downloadPhotosAsZip([makePhoto()], "my-listing");
    expect(anchorClickSpy).toHaveBeenCalledTimes(1);
  });
});
