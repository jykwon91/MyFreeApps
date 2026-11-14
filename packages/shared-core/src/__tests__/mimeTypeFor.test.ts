import { describe, expect, it } from "vitest";
import { mimeTypeFor } from "../utils/mimeTypeFor";

describe("mimeTypeFor", () => {
  it.each([
    ["scan.PDF", "application/pdf"],
    ["photo.jpeg", "image/jpeg"],
    ["letter.doc", "application/msword"],
    ["lease.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["ledger.xls", "application/vnd.ms-excel"],
    ["ledger.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ["bank.csv", "text/csv"],
    ["receipts.zip", "application/zip"],
  ])("knows %s", (name, type) => {
    expect(mimeTypeFor(name)).toBe(type);
  });

  it("says octet-stream for a type it doesn't know", () => {
    expect(mimeTypeFor("notes.heic")).toBe("application/octet-stream");
    expect(mimeTypeFor("no-extension")).toBe("application/octet-stream");
  });
});
