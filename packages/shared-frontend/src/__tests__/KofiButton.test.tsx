import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import KofiButton from "../components/widgets/KofiButton";

describe("KofiButton", () => {
  it("renders an anchor to the Ko-fi URL that opens safely in a new tab", () => {
    render(<KofiButton url="https://ko-fi.com/example" />);
    const link = screen.getByRole("link", { name: /support on ko-fi/i });
    expect(link).toHaveAttribute("href", "https://ko-fi.com/example");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("announces the new-tab behavior to screen readers", () => {
    render(<KofiButton url="https://ko-fi.com/example" />);
    expect(screen.getByText(/opens in a new tab/i)).toBeInTheDocument();
  });

  it("hides the decorative external-link icon from assistive tech", () => {
    render(<KofiButton url="https://ko-fi.com/example" />);
    const link = screen.getByRole("link", { name: /support on ko-fi/i });
    expect(link.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it("supports a custom label", () => {
    render(<KofiButton url="https://ko-fi.com/example" label="Buy me a coffee" />);
    expect(screen.getByRole("link", { name: /buy me a coffee/i })).toBeInTheDocument();
  });
});
