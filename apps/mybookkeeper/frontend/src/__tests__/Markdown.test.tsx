import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Markdown from "@/shared/components/ui/Markdown";

describe("Markdown", () => {
  describe("rendering nothing", () => {
    it("renders nothing for empty string", () => {
      const { container } = render(<Markdown content="" />);
      expect(container.firstChild).toBeNull();
    });

    it("renders nothing for null", () => {
      const { container } = render(<Markdown content={null} />);
      expect(container.firstChild).toBeNull();
    });

    it("renders nothing for undefined", () => {
      const { container } = render(<Markdown content={undefined} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe("basic formatting", () => {
    it("renders bold text as <strong>", () => {
      render(<Markdown content="**bold text**" />);
      const strong = document.querySelector("strong");
      expect(strong).toBeInTheDocument();
      expect(strong?.textContent).toBe("bold text");
    });

    it("renders italic text as <em>", () => {
      render(<Markdown content="*italic text*" />);
      const em = document.querySelector("em");
      expect(em).toBeInTheDocument();
      expect(em?.textContent).toBe("italic text");
    });

    it("renders headings", () => {
      render(<Markdown content="# Heading One" />);
      // h1 in markdown maps to h2 element (scaled down one level)
      const heading = document.querySelector("h2");
      expect(heading).toBeInTheDocument();
      expect(heading?.textContent).toBe("Heading One");
    });

    it("renders h2 as h3", () => {
      render(<Markdown content="## Heading Two" />);
      const heading = document.querySelector("h3");
      expect(heading).toBeInTheDocument();
    });
  });

  describe("lists", () => {
    it("renders unordered list", () => {
      render(<Markdown content={"- item one\n- item two\n- item three"} />);
      const list = document.querySelector("ul");
      expect(list).toBeInTheDocument();
      const items = document.querySelectorAll("li");
      expect(items).toHaveLength(3);
      expect(items[0].textContent).toBe("item one");
    });

    it("renders ordered list", () => {
      render(<Markdown content={"1. first\n2. second"} />);
      const list = document.querySelector("ol");
      expect(list).toBeInTheDocument();
    });
  });

  describe("blockquote", () => {
    it("renders blockquote", () => {
      render(<Markdown content="> This is a quote" />);
      const blockquote = document.querySelector("blockquote");
      expect(blockquote).toBeInTheDocument();
    });
  });

  describe("links", () => {
    it("renders http links with rel=noopener noreferrer and target=_blank", () => {
      render(<Markdown content="[click me](https://example.com)" />);
      const link = document.querySelector("a");
      expect(link).toBeInTheDocument();
      expect(link?.getAttribute("href")).toBe("https://example.com");
      expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
      expect(link?.getAttribute("target")).toBe("_blank");
    });

    it("renders mailto links", () => {
      render(<Markdown content="[email](mailto:test@example.com)" />);
      const link = document.querySelector("a");
      expect(link).toBeInTheDocument();
      expect(link?.getAttribute("href")).toBe("mailto:test@example.com");
      expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    });
  });

  describe("security — XSS prevention", () => {
    it("neutralizes javascript: protocol links — renders as plain text, not a link", () => {
      render(<Markdown content="[malicious](javascript:alert(1))" />);
      // Should NOT produce an <a> element with href=javascript:
      const links = document.querySelectorAll("a");
      for (const link of links) {
        const href = link.getAttribute("href") ?? "";
        expect(href.startsWith("javascript:")).toBe(false);
      }
      // The text content should still be present
      expect(screen.getByText("malicious")).toBeInTheDocument();
    });

    it("does not inject a <script> tag from markdown source", () => {
      render(<Markdown content={"<script>alert('xss')</script>"} />);
      // react-markdown without rehype-raw escapes raw HTML — no script element
      const scripts = document.querySelectorAll("script");
      expect(scripts).toHaveLength(0);
    });

    it("does not execute <img onerror=...> from markdown source", () => {
      render(<Markdown content={'<img src="x" onerror="alert(1)">'} />);
      // No img element with an onerror attribute should appear
      const imgs = document.querySelectorAll("img");
      for (const img of imgs) {
        expect(img.getAttribute("onerror")).toBeNull();
      }
    });

    it("images in markdown syntax are NOT rendered (explicitly disabled)", () => {
      render(<Markdown content="![alt text](https://tracker.example.com/pixel.png)" />);
      // The img renderer returns null — no img element
      const imgs = document.querySelectorAll("img");
      expect(imgs).toHaveLength(0);
    });
  });

  describe("inline code", () => {
    it("renders inline code", () => {
      render(<Markdown content="Use `const x = 1` here" />);
      const code = document.querySelector("code");
      expect(code).toBeInTheDocument();
      expect(code?.textContent).toBe("const x = 1");
    });
  });

  describe("className prop", () => {
    it("applies className to wrapper div", () => {
      const { container } = render(<Markdown content="hello" className="mt-3" />);
      expect(container.firstChild).toHaveClass("mt-3");
    });
  });
});
