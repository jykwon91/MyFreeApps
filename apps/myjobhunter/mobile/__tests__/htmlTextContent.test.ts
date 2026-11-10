import { htmlToPlainText } from "@myjobhunter/api-client/utils/htmlToPlainText";
import { htmlTextContent } from "../src/lib/htmlTextContent";

/**
 * The website reads a posting's description with the browser's DOMParser; the phone has none, so
 * it uses parse5. These are the website's own stripHtml cases, so the notes come out the same.
 */
const plain = (html: string) => htmlToPlainText(html, htmlTextContent);

describe("a posting's description as plain text", () => {
  it("removes tags and keeps the prose", () => {
    expect(plain("<p>Senior <strong>Engineer</strong></p>")).toBe("Senior Engineer");
  });

  it("turns <br> and block tags into line breaks", () => {
    expect(plain("one<br>two<br/>three")).toBe("one\ntwo\nthree");
    expect(plain("<p>alpha</p><p>beta</p>")).toBe("alpha\n\nbeta");
    expect(plain("<li>a</li><li>b</li>")).toBe("a\n\nb");
  });

  it("collapses runs of three or more newlines", () => {
    expect(plain("a<br><br><br><br>b")).toBe("a\n\nb");
  });

  it("decodes entities", () => {
    expect(plain("Ben&nbsp;&amp; Jerry&#39;s &quot;best&quot;")).toBe('Ben & Jerry\'s "best"');
  });

  it("decodes an escaped tag to literal text, exactly once", () => {
    expect(plain("&lt;script&gt;alert(1)&lt;/script&gt;")).toBe("<script>alert(1)</script>");
    expect(plain("&amp;lt;script&amp;gt;")).toBe("&lt;script&gt;");
    expect(plain("&amp;lt;b&amp;gt;")).toBe("&lt;b&gt;");
  });

  it("drops script, style, noscript and template bodies rather than inlining them as prose", () => {
    expect(plain("<p>real</p><script>alert(1)</script>")).toBe("real");
    expect(plain("<style>.a{color:red}</style><p>real</p>")).toBe("real");
    expect(plain("<noscript>enable js</noscript><p>real</p>")).toBe("real");
    expect(plain("<template><p>hidden</p></template><p>real</p>")).toBe("real");
  });

  it("handles an unterminated tag without leaking it", () => {
    expect(plain("safe <script")).toBe("safe");
  });

  it("returns an empty string for empty or tag-only input", () => {
    expect(plain("")).toBe("");
    expect(plain("<div></div>")).toBe("");
  });
});
