import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Register from "@/pages/Register";

vi.mock("@/lib/auth", () => ({
  register: vi.fn(),
}));

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return { ...actual, useIsAuthenticated: vi.fn(() => false) };
});

function renderRegister(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/register${search}`]}>
      <Routes>
        <Route path="/register" element={<Register />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Register sign-in link", () => {
  it("carries a safe in-app returnTo to the sign-in page", () => {
    renderRegister(`?returnTo=${encodeURIComponent("/recipes/42?tab=notes")}`);

    expect(screen.getAllByRole("link", { name: /sign in/i })[0]).toHaveAttribute(
      "href",
      "/login?returnTo=%2Frecipes%2F42%3Ftab%3Dnotes",
    );
  });

  it.each(["https://evil.example/steal", "//evil.example"])("drops %s", (bad) => {
    renderRegister(`?returnTo=${encodeURIComponent(bad)}`);

    expect(screen.getAllByRole("link", { name: /sign in/i })[0]).toHaveAttribute("href", "/login");
  });
});
