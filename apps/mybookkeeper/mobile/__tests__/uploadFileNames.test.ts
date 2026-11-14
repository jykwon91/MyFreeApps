import { documentFileName } from "../src/features/capture/uploadFileNames";

describe("documentFileName", () => {
  it("keeps a supported name as it is", () => {
    expect(documentFileName({ uri: "cache:/a", name: "lease.docx", mimeType: "application/pdf" })).toBe("lease.docx");
  });

  it("never renames a file that already has an extension, so an unsupported one is refused rather than sent", () => {
    expect(documentFileName({ uri: "cache:/IMG_1.HEIC", name: "IMG_1.HEIC", mimeType: "image/jpeg" })).toBe("IMG_1.HEIC");
    expect(documentFileName({ uri: "cache:/notes.txt", name: "notes.txt", mimeType: "application/pdf" })).toBe("notes.txt");
  });

  it("adds the extension for the reported type when the name has none", () => {
    expect(documentFileName({ uri: "cache:/x", name: "Statement", mimeType: "application/pdf" })).toBe("Statement.pdf");
  });

  it.each([
    ["text/comma-separated-values", "ledger.csv"],
    ["application/x-zip-compressed", "ledger.zip"],
  ])("reads the other name a picker gives, %s", (mimeType, expected) => {
    expect(documentFileName({ uri: "cache:/x", name: "ledger", mimeType })).toBe(expected);
  });

  it("falls back to the extension on the picker's own copy", () => {
    expect(documentFileName({ uri: "cache:/copy.xlsx", name: "ledger", mimeType: "application/octet-stream" })).toBe("ledger.xlsx");
  });

  it("leaves a name it can't place, for the allowlist to refuse", () => {
    expect(documentFileName({ uri: "cache:/copy", name: "ledger", mimeType: "application/octet-stream" })).toBe("ledger");
  });
});
