import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { NOT_FOUND_COPY } from "@mylanguagetutor/api-client/constants/notFoundCopy";
import NotFound from "@/pages/NotFound";

describe("NotFound page", () => {
  it("says the page isn't there, in the phone's words, and links back home", () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByText(NOT_FOUND_COPY.body)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/");
  });
});
