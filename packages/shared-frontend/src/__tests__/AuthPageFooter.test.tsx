import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AuthPageFooter from "../components/layout/AuthPageFooter";

function renderFooter(appName = "MyTestApp") {
  return render(
    <MemoryRouter>
      <AuthPageFooter appName={appName} />
    </MemoryRouter>,
  );
}

describe("AuthPageFooter", () => {
  it("renders a 'Support Me' link pointing at /support", () => {
    renderFooter();
    const link = screen.getByRole("link", { name: "Support Me" });
    expect(link).toHaveAttribute("href", "/support");
  });

  it("renders the app name and current year in the copyright line", () => {
    renderFooter("MyBookkeeper");
    const year = new Date().getFullYear();
    expect(
      screen.getByText(new RegExp(`© ${year} MyBookkeeper`)),
    ).toBeInTheDocument();
  });
});
