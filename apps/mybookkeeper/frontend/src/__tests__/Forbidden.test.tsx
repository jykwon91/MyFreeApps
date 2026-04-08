import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import Forbidden from "@/app/pages/Forbidden";

function renderForbidden() {
  return render(
    <BrowserRouter>
      <Forbidden />
    </BrowserRouter>
  );
}

describe("Forbidden", () => {
  it("renders the 403 heading", () => {
    renderForbidden();

    expect(screen.getByRole("heading", { name: "Hmm, can't go there" })).toBeInTheDocument();
  });

  it("renders the access denied explanation", () => {
    renderForbidden();

    expect(
      screen.getByText(/you don't have access to this page/i)
    ).toBeInTheDocument();
  });

  it("renders the Back to Dashboard link", () => {
    renderForbidden();

    expect(
      screen.getByRole("link", { name: "Back to Dashboard" })
    ).toBeInTheDocument();
  });

  it("Back to Dashboard link points to the root path", () => {
    renderForbidden();

    expect(
      screen.getByRole("link", { name: "Back to Dashboard" })
    ).toHaveAttribute("href", "/");
  });

  it("mentions asking an admin to upgrade the role", () => {
    renderForbidden();

    expect(screen.getByText(/ask an admin to upgrade your role/i)).toBeInTheDocument();
  });
});
