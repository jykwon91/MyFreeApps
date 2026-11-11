import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import InlineBoldText from "../components/ui/InlineBoldText";

describe("InlineBoldText", () => {
  it("renders plain text without any strong elements", () => {
    render(<InlineBoldText text="plain text only" />);
    expect(screen.getByText("plain text only")).toBeInTheDocument();
    expect(document.querySelector("strong")).toBeNull();
  });

  it("renders a bold segment inside a <strong> element", () => {
    render(<InlineBoldText text="**bold word**" />);
    expect(screen.getByText("bold word").tagName).toBe("STRONG");
  });

  it("renders interleaved plain and bold segments", () => {
    const { container } = render(<InlineBoldText text="hello **world** today" />);
    expect(screen.getByText("world").tagName).toBe("STRONG");
    // The plain segments are bare text nodes beside the <strong>, not elements.
    expect(container.textContent).toBe("hello world today");
    expect(container.querySelectorAll("strong")).toHaveLength(1);
  });

  it("applies the default boldClassName to bold segments", () => {
    render(<InlineBoldText text="**word**" />);
    expect(screen.getByText("word")).toHaveClass("text-foreground");
  });

  it("applies a custom boldClassName to bold segments", () => {
    render(<InlineBoldText text="**word**" boldClassName="font-semibold" />);
    expect(screen.getByText("word")).toHaveClass("font-semibold");
    expect(screen.getByText("word")).not.toHaveClass("text-foreground");
  });

  it("renders an empty string without errors", () => {
    const { container } = render(<InlineBoldText text="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders multiple bold segments correctly", () => {
    render(<InlineBoldText text="**first** and **second**" />);
    const strongs = document.querySelectorAll("strong");
    expect(strongs).toHaveLength(2);
    expect(strongs[0].textContent).toBe("first");
    expect(strongs[1].textContent).toBe("second");
  });
});
