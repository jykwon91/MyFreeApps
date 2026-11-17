import { Directory, File, Paths } from "expo-file-system";
import { shareAsync } from "expo-sharing";
import { fakeDownloads, fakeFiles, resetFakeFiles } from "../../test-support/fakeFileSystem";
import { FILE_DOWNLOAD_TIMEOUT_MS } from "@platform/core/constants/requestTimeouts";
import { DownloadFailure } from "../utils/DownloadFailure";
import { clearDownloadCopies } from "../utils/clearDownloadCopies";
import { newDownloadFolder } from "../utils/newDownloadFolder";
import { shareDownloadedFile } from "../utils/shareDownloadedFile";

jest.mock("expo-file-system", () => jest.requireActual("../../test-support/fakeFileSystem"));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));

const share = jest.mocked(shareAsync);
const URL = "https://api.example.com/export?format=pdf";
const OPTIONS = { headers: { Authorization: "Bearer t" }, share: { mimeType: "application/pdf", UTI: "com.adobe.pdf" } };
const exportsFolder = () => new Directory(Paths.cache, "exports");

beforeEach(() => {
  resetFakeFiles();
  share.mockReset();
});

describe("shareDownloadedFile", () => {
  it("downloads to the destination, shares it, then removes it", async () => {
    share.mockImplementation(async (uri) => {
      expect(fakeFiles()).toEqual([uri]);
    });
    await shareDownloadedFile(URL, new File(exportsFolder(), "resume.pdf"), OPTIONS);
    expect(fakeDownloads()).toEqual([URL]);
    expect(share).toHaveBeenCalledWith("cache:/exports/resume.pdf", OPTIONS.share);
    expect(fakeFiles()).toEqual([]);
  });

  it("still removes the copy when sharing fails, and passes the failure on", async () => {
    share.mockRejectedValue(new Error("no share sheet"));
    await expect(shareDownloadedFile(URL, new File(exportsFolder(), "resume.pdf"), OPTIONS)).rejects.toThrow("no share sheet");
    expect(fakeFiles()).toEqual([]);
  });
});

describe("a download that doesn't finish", () => {
  const destination = () => new File(exportsFolder(), "resume.pdf");

  async function failureOf(promise: Promise<void>): Promise<DownloadFailure> {
    const error: unknown = await promise.then(() => null, (reason: unknown) => reason);
    expect(error).toBeInstanceOf(DownloadFailure);
    return error as DownloadFailure;
  }

  it("is cancelled after the limit, reported as a timeout, and leaves no partial file", async () => {
    jest.useFakeTimers();
    try {
      jest.spyOn(File, "downloadFileAsync").mockImplementationOnce(async (_url, to, options) => {
        (to as File).create();
        await new Promise<never>((_, reject) => options?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
        throw new Error("unreachable");
      });
      const pending = failureOf(shareDownloadedFile(URL, destination(), OPTIONS));
      await jest.advanceTimersByTimeAsync(FILE_DOWNLOAD_TIMEOUT_MS);
      expect((await pending).kind).toBe("timeout");
      expect(share).not.toHaveBeenCalled();
      expect(fakeFiles()).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });

  it.each([
    ["response has status: 401", "signedOut"],
    ["server returned HTTP 404", "notFound"],
    ["response has status 500", "other"],
    ["The Internet connection appears to be offline.", "offline"],
    ["Unable to resolve host api.example.com", "offline"],
    ["Request failed", "other"],
  ])("reports %s as %s and shares nothing", async (message, kind) => {
    jest.spyOn(File, "downloadFileAsync").mockRejectedValueOnce(new Error(message));
    const failure = await failureOf(shareDownloadedFile(URL, destination(), OPTIONS));
    expect(failure.kind).toBe(kind);
    expect(failure.message).toBe(message);
    expect(share).not.toHaveBeenCalled();
    expect(fakeFiles()).toEqual([]);
  });

  it("asks for the download to be cancellable and clears the timer once it finishes", async () => {
    const download = jest.spyOn(File, "downloadFileAsync");
    download.mockClear();
    await shareDownloadedFile(URL, destination(), OPTIONS);
    const signal = download.mock.calls[0]?.[2]?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
  });
});

describe("newDownloadFolder", () => {
  it("gives two downloads of the same file their own copies, so the first finishing leaves the second's alone", async () => {
    const sheets: (() => void)[] = [];
    share.mockImplementation(() => new Promise<void>((resolve) => sheets.push(resolve)));
    const first = shareDownloadedFile(URL, new File(newDownloadFolder(exportsFolder()), "resume.pdf"), OPTIONS);
    const second = shareDownloadedFile(URL, new File(newDownloadFolder(exportsFolder()), "resume.pdf"), OPTIONS);
    await Promise.resolve();
    await Promise.resolve();
    const [firstCopy, secondCopy] = share.mock.calls.map(([uri]) => uri);
    expect(firstCopy).toMatch(/^cache:\/exports\/\d+\/resume\.pdf$/);
    expect(firstCopy).not.toBe(secondCopy);

    sheets[0]?.();
    await first;
    expect(fakeFiles()).toEqual([secondCopy]);
    sheets[1]?.();
    await second;
    expect(fakeFiles()).toEqual([]);
  });
});

describe("clearDownloadCopies", () => {
  it("clears whatever an earlier run left in the folder, and nothing outside it", () => {
    resetFakeFiles(["cache:/exports/3/resume.pdf", "cache:/exports/4/resume.docx", "cache:/other/keep.pdf"]);
    clearDownloadCopies(exportsFolder());
    expect(fakeFiles()).toEqual(["cache:/other/keep.pdf"]);
  });

  it("only logs when the folder can't be cleared", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const folder = exportsFolder();
    jest.spyOn(folder, "delete").mockImplementation(() => {
      throw new Error("busy");
    });
    resetFakeFiles(["cache:/exports/1/resume.pdf"]);
    expect(() => clearDownloadCopies(folder)).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
