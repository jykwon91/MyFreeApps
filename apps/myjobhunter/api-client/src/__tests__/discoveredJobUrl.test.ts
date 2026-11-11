import { describe, expect, it } from "vitest";
import { discoveredJobUrl } from "../utils/discoveredJobUrl";

describe("discoveredJobUrl", () => {
  it("gives back an http or https posting link, trimmed", () => {
    expect(discoveredJobUrl({ source_url: " https://jobs.example.com/1 " })).toBe("https://jobs.example.com/1");
    expect(discoveredJobUrl({ source_url: "http://jobs.example.com/2" })).toBe("http://jobs.example.com/2");
  });

  it("refuses any other scheme, so a feed can't hand over a script to run", () => {
    expect(discoveredJobUrl({ source_url: "javascript:alert(1)" })).toBeNull();
    expect(discoveredJobUrl({ source_url: "data:text/html,hi" })).toBeNull();
    expect(discoveredJobUrl({ source_url: "jobs.example.com" })).toBeNull();
  });

  it("is null when the posting has no link", () => {
    expect(discoveredJobUrl({ source_url: null })).toBeNull();
  });
});
