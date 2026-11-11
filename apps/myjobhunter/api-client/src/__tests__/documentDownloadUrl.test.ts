import { describe, expect, it } from "vitest";
import { documentDownloadUrl } from "../utils/documentDownloadUrl";

describe("documentDownloadUrl", () => {
  it("passes an http or https link, trimmed", () => {
    expect(documentDownloadUrl({ url: "https://files.example.com/a.pdf?sig=1" })).toBe("https://files.example.com/a.pdf?sig=1");
    expect(documentDownloadUrl({ url: " http://localhost:9000/a.pdf " })).toBe("http://localhost:9000/a.pdf");
  });

  it("refuses any other scheme or a bare word", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,hi", "file:///etc/passwd", "intent://x", "myjobhunter://x", "files.example.com/a.pdf", ""]) {
      expect(documentDownloadUrl({ url })).toBeNull();
    }
  });
});
