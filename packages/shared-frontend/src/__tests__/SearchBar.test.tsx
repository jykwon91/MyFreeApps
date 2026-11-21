import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SearchBar from "../components/layout/SearchBar";

describe("SearchBar", () => {
  it("names the input with the label prop, independent of the placeholder", () => {
    render(<SearchBar label="Search recipes" placeholder="What are you looking for?" />);
    const input = screen.getByRole("searchbox", { name: "Search recipes" });
    expect(input).toHaveAttribute("placeholder", "What are you looking for?");
  });
});
