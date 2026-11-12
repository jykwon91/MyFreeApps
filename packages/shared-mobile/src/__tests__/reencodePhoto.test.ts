import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { reencodePhoto } from "../utils/reencodePhoto";

const mockContext = { resize: jest.fn(), renderAsync: jest.fn(), release: jest.fn() };
const mockImage = { saveAsync: jest.fn(), release: jest.fn() };
jest.mock("expo-image-manipulator", () => ({ SaveFormat: { JPEG: "jpeg" }, ImageManipulator: { manipulate: jest.fn() } }));

const ENCODING = { longestSide: 1000, quality: 0.8 };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(ImageManipulator.manipulate).mockReturnValue(mockContext as never);
  mockContext.renderAsync.mockResolvedValue(mockImage);
  mockImage.saveAsync.mockResolvedValue({ uri: "file:///cache/out.jpg" });
});

describe("reencodePhoto", () => {
  it("downsamples while decoding to fit the longest edge, and saves a JPEG at the quality asked for", async () => {
    expect(await reencodePhoto("file:///in.heic", ENCODING)).toBe("file:///cache/out.jpg");
    expect(ImageManipulator.manipulate).toHaveBeenCalledWith("file:///in.heic", { maxWidth: 1000, maxHeight: 1000 });
    expect(mockImage.saveAsync).toHaveBeenCalledWith({ format: SaveFormat.JPEG, compress: 0.8 });
  });

  it("doesn't resize after decoding, so the photo is never held at full size", async () => {
    await reencodePhoto("file:///in.png", ENCODING);
    expect(mockContext.resize).not.toHaveBeenCalled();
    expect(mockImage.saveAsync).toHaveBeenCalledTimes(1);
  });

  it("lets go of the native memory even when saving fails", async () => {
    mockImage.saveAsync.mockRejectedValue(new Error("disk full"));
    await expect(reencodePhoto("file:///in.jpg", ENCODING)).rejects.toThrow("disk full");
    expect(mockImage.release).toHaveBeenCalledTimes(1);
    expect(mockContext.release).toHaveBeenCalledTimes(1);
  });
});
