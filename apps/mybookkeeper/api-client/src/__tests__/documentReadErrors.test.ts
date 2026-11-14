import { describe, expect, it } from "vitest";
import { readDocumentErrorMessage } from "../utils/documentReadErrors";

describe("readDocumentErrorMessage", () => {
  it("names the documents upload limit on a 413, since a read stores the file as a document first", () => {
    expect(readDocumentErrorMessage(413)).toBe(
      "That file's too big for me — I can take up to 29 MB. Try a smaller scan, or a photo at lower resolution.",
    );
  });
});
