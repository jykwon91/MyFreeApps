import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import InlineBoldText, { __INTERNAL__ } from "../components/ui/InlineBoldText";

const { parseBoldSegments } = __INTERNAL__;

describe("parseBoldSegments", () => {
  it("returns a single plain segment for a string with no bold markers", () => {
    expect(parseBoldSegments("hello world")).toEqual([
      { text: "hello world", bold: false },
    ]);
  });

  it("returns a single bold segment for a fully-wrapped string", () => {
    expect(parseBoldSegments("**bold**")).toEqual([
      { text: "bold", bold: true },
    ]);
  });

  it("splits a string into plain + bold + plain", () => {
    expect(parseBoldSegments("hello **world** today")).toEqual([
      { text: "hello ", bold: false },
      { text: "world", bold: true },
      { text: " today", bold: false },
    ]);
  });

  it("handles multiple bold segments", () => {
    expect(parseBoldSegments("**a** and **b**")).toEqual([
      { text: "a", bold: true },
      { text: " and ", bold: false },
      { text: "b", bold: true },
    ]);
  });

  it("returns an empty array for an empty string", () => {
    expect(parseBoldSegments("")).toEqual([]);
  });

  it("treats unbalanced opening markers as plain text", () => {
    const result = parseBoldSegments("hello **world");
    expect(result).toEqual([{ text: "hello **world", bold: false }]);
  });

  it("treats unbalanced closing markers as plain text", () => {
    const result = parseBoldSegments("hello world**");
    expect(result).toEqual([{ text: "hello world**", bold: false }]);
  });

  it("handles bold segment at the very start", () => {
    expect(parseBoldSegments("**start** of the string")).toEqual([
      { text: "start", bold: true },
      { text: " of the string", bold: false },
    ]);
  });

  it("handles bold segment at the very end", () => {
    expect(parseBoldSegments("end of the **string**")).toEqual([
      { text: "end of the ", bold: false },
      { text: "string", bold: true },
    ]);
  });
});

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
    render(<InlineBoldText text="hello **world** today" />);
    expect(screen.getByText("world").tagName).toBe("STRONG");
    expect(screen.getByText("hello ")).toBeInTheDocument();
    expect(screen.getByText(" today")).toBeInTheDocument();
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
    expect(container.firstChild).toBeEmptyDOMElement();
  });

  it("renders multiple bold segments correctly", () => {
    render(<InlineBoldText text="**first** and **second**" />);
    const strongs = document.querySelectorAll("strong");
    expect(strongs).toHaveLength(2);
    expect(strongs[0].textContent).toBe("first");
    expect(strongs[1].textContent).toBe("second");
  });
});
