import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SettingsPage from "../pages/SettingsPage";

function renderPage(securityPath?: string) {
  return render(
    <MemoryRouter>
      <SettingsPage securityPath={securityPath} />
    </MemoryRouter>,
  );
}

describe("SettingsPage", () => {
  it("links to /security by default", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /two-factor authentication/i })).toHaveAttribute("href", "/security");
  });

  it("links to the app's own Security path", () => {
    renderPage("/account/security");
    expect(screen.getByRole("link", { name: /two-factor authentication/i })).toHaveAttribute("href", "/account/security");
  });

  it("has no scaffold placeholder text", () => {
    renderPage();
    expect(screen.queryByText(/add app-specific settings here/i)).not.toBeInTheDocument();
  });
});
