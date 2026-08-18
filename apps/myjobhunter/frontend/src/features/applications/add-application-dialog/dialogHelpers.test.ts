import { describe, expect, it } from "vitest";

import { combineNotes, stripHtml } from "./dialogHelpers";
import type { JdUrlExtractResponse } from "@/types/application/jd-url-extract-response";

/**
 * `stripHtml` turns an extracted job-description fragment into the plain-text
 * notes scaffold. The fragment comes from a third-party page the user pointed
 * us at, so it is untrusted input; the regex chain this replaced reconstructed
 * markup from escaped input in two distinct ways, both pinned below.
 */
describe("stripHtml", () => {
  it("removes tags and keeps the prose", () => {
    expect(stripHtml("<p>Senior <strong>Engineer</strong></p>")).toBe("Senior Engineer");
  });

  it("turns <br> and block tags into line breaks", () => {
    expect(stripHtml("one<br>two<br/>three")).toBe("one\ntwo\nthree");
    expect(stripHtml("<p>alpha</p><p>beta</p>")).toBe("alpha\n\nbeta");
    // Open AND close tags each become a break, so consecutive items read as
    // separated paragraphs. Unchanged from the previous implementation.
    expect(stripHtml("<li>a</li><li>b</li>")).toBe("a\n\nb");
  });

  it("collapses runs of three or more newlines", () => {
    expect(stripHtml("a<br><br><br><br>b")).toBe("a\n\nb");
  });

  it("decodes entities", () => {
    expect(stripHtml("Ben&nbsp;&amp; Jerry&#39;s &quot;best&quot;")).toBe(
      'Ben & Jerry\'s "best"',
    );
  });

  // An escaped tag is prose the page displayed literally, so it comes back as
  // literal text — the contract is "HTML -> plain text", not "HTML -> safe
  // HTML". What matters is that decoding happens exactly once, in one pass, so
  // the output is a faithful transcript rather than a partially re-parsed one.
  it("decodes an escaped tag to literal text, exactly once", () => {
    expect(stripHtml("&lt;script&gt;alert(1)&lt;/script&gt;")).toBe(
      "<script>alert(1)</script>",
    );
    expect(stripHtml("&amp;lt;script&amp;gt;")).toBe("&lt;script&gt;");
  });

  // Regression: `&amp;` -> `&` ran as its own replacement before `&lt;` -> `<`,
  // so `&amp;lt;` was unescaped twice and yielded a bare `<`.
  it("does not double-unescape", () => {
    expect(stripHtml("&amp;lt;b&amp;gt;")).toBe("&lt;b&gt;");
  });

  it("drops script and style bodies rather than inlining them as prose", () => {
    expect(stripHtml("<p>real</p><script>alert(1)</script>")).toBe("real");
    expect(stripHtml("<style>.a{color:red}</style><p>real</p>")).toBe("real");
  });

  it("handles an unterminated tag without leaking it", () => {
    expect(stripHtml("safe <script")).toBe("safe");
  });

  it("returns an empty string for empty or tag-only input", () => {
    expect(stripHtml("")).toBe("");
    expect(stripHtml("<div></div>")).toBe("");
  });
});

describe("combineNotes", () => {
  const base: JdUrlExtractResponse = {} as JdUrlExtractResponse;

  it("returns null when every chunk is absent", () => {
    expect(combineNotes({ ...base })).toBeNull();
  });

  it("joins summary, stripped description, and requirements with blank lines", () => {
    const result = {
      ...base,
      summary: "Summary line",
      description_html: "<p>Desc</p>",
      requirements_text: "Reqs",
    } as JdUrlExtractResponse;
    expect(combineNotes(result)).toBe("Summary line\n\nDesc\n\nReqs");
  });

  it("omits a description that strips down to nothing", () => {
    const result = {
      ...base,
      summary: "Summary line",
      description_html: "<div>   </div>",
    } as JdUrlExtractResponse;
    expect(combineNotes(result)).toBe("Summary line");
  });
});
