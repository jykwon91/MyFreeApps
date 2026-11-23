import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PHOTO_IMPORT_JPEG_QUALITY, PHOTO_IMPORT_LONGEST_SIDE } from "@myrecipes/api-client/constants/photoImport";
import { downscalePhoto } from "@/utils/downscalePhoto";

const ORIGINAL = new File(["original"], "card.PNG", { type: "image/png" });
const close = vi.fn();
const toBlob = vi.fn();
const drawImage = vi.fn();
let canvas: { width: number; height: number };

function stubBrowser(size: { width: number; height: number }, blob: Blob | null = new Blob(["small"])) {
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ ...size, close }));
  toBlob.mockImplementation((done: (b: Blob | null) => void) => done(blob));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    fillRect: vi.fn(),
    drawImage,
    set fillStyle(_: string) {},
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, cb, type, quality) {
    canvas = { width: this.width, height: this.height };
    toBlob(cb, type, quality);
  });
}

beforeEach(() => {
  close.mockClear();
  drawImage.mockClear();
  toBlob.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("downscalePhoto", () => {
  it("shrinks a large photo to the shared long edge, keeping its proportions, as a JPEG at the shared quality", async () => {
    stubBrowser({ width: 4000, height: 3000 });
    const result = await downscalePhoto(ORIGINAL);

    expect(canvas).toEqual({ width: PHOTO_IMPORT_LONGEST_SIDE, height: 1176 });
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", PHOTO_IMPORT_JPEG_QUALITY);
    expect(result.type).toBe("image/jpeg");
    expect(result.name).toBe("card.jpg");
    expect(close).toHaveBeenCalled();
  });

  it("measures a tall photo by its height", async () => {
    stubBrowser({ width: 1000, height: 3136 });
    await downscalePhoto(ORIGINAL);
    expect(canvas).toEqual({ width: 500, height: PHOTO_IMPORT_LONGEST_SIDE });
  });

  it("never enlarges a photo that is already small", async () => {
    stubBrowser({ width: 800, height: 600 });
    await downscalePhoto(ORIGINAL);
    expect(canvas).toEqual({ width: 800, height: 600 });
  });

  it("sends the original when the browser can't read the photo", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("undecodable")));
    expect(await downscalePhoto(ORIGINAL)).toBe(ORIGINAL);
  });

  it("sends the original when the browser can't write a JPEG", async () => {
    stubBrowser({ width: 4000, height: 3000 }, null);
    expect(await downscalePhoto(ORIGINAL)).toBe(ORIGINAL);
    expect(close).toHaveBeenCalled();
  });
});
