import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Settings from "@/pages/Settings";

describe("Settings page", () => {
  it("links to Security and has no scaffold placeholder", () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: /two-factor authentication/i })).toHaveAttribute("href", "/security");
    expect(screen.queryByText(/add app-specific settings here/i)).not.toBeInTheDocument();
  });
});
