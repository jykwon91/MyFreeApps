import { describe, it, expect } from "vitest";
import { formatSavingsRange, sourceSiteName } from "../utils/savingsFormat";
import { refusedRequestDetail } from "../utils/refusedRequestDetail";

describe("formatSavingsRange", () => {
  it("shows one amount when low and high round to the same dollars", () => {
    expect(formatSavingsRange(12_000, 12_049)).toBe("$120");
  });

  it("shows a range otherwise", () => {
    expect(formatSavingsRange(75_000, 90_000)).toBe("$750–$900");
  });
});

describe("sourceSiteName", () => {
  it("is the host without www", () => {
    expect(sourceSiteName("https://www.Chase.com/sapphire?x=1")).toBe("chase.com");
    expect(sourceSiteName("http://user@bank.example:8080/a")).toBe("bank.example");
  });

  it("falls back to the text when it isn't a URL", () => {
    expect(sourceSiteName("chase dot com")).toBe("chase dot com");
  });
});

describe("refusedRequestDetail", () => {
  it("uses the server's reason for a limit or a conflict", () => {
    expect(refusedRequestDetail({ status: 429, data: { detail: "Used all 3." } }, "fallback")).toBe("Used all 3.");
    expect(refusedRequestDetail({ status: 409, data: { detail: "Already running." } }, "fallback")).toBe("Already running.");
  });

  it("falls back for anything else", () => {
    expect(refusedRequestDetail({ status: 500, data: { detail: "Traceback" } }, "fallback")).toBe("fallback");
    expect(refusedRequestDetail(new Error("offline"), "fallback")).toBe("fallback");
  });
});
