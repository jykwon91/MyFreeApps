import { plainFromMarkdown } from "../src/lib/plainFromMarkdown";

describe("plainFromMarkdown", () => {
  it.each([
    ["headings", "## Parking", "Parking"],
    ["bold and italics", "**Router** and *closet* and ***both***", "Router and closet and both"],
    ["struck text", "~~old code~~", "old code"],
    ["inline code", "Press `Reset` twice", "Press Reset twice"],
    ["quotes", "> Quiet after 10", "Quiet after 10"],
    ["links", "[Trash days](https://city.example/trash)", "Trash days"],
    ["links with brackets in the address", "[Park](https://x.example/a_(b)) today", "Park today"],
    ["bare links", "<https://city.example>", "https://city.example"],
  ])("takes the markers off %s", (_name, markdown, plain) => {
    expect(plainFromMarkdown(markdown)).toBe(plain);
  });

  it("keeps a sub-list under its parent", () => {
    expect(plainFromMarkdown("- Kitchen\n  - Spare key")).toBe("• Kitchen\n  • Spare key");
  });

  it("removes rules and code fences, keeping the code", () => {
    expect(plainFromMarkdown("One\n\n---\n\nTwo")).toBe("One\n\n\n\nTwo");
    expect(plainFromMarkdown("```\ncode 1234\n```")).toBe("code 1234\n");
  });

  it("reads a table row by row", () => {
    expect(plainFromMarkdown("| Network | Password |\n|---|:--:|\n| Lakeview | sunny |")).toBe("Network · Password\nLakeview · sunny");
  });

  it("leaves a hyphen or a pipe in ordinary text alone", () => {
    expect(plainFromMarkdown("Check-in is 3-5 | ask first")).toBe("Check-in is 3-5 | ask first");
  });

  it("doesn't slow down on a long text full of markers", () => {
    const started = Date.now();
    plainFromMarkdown("*_[(`~|-".repeat(5000));
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
