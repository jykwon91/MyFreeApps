import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Register from "@/pages/Register";

vi.mock("@/lib/auth", () => ({ register: vi.fn() }));

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return { ...actual, useIsAuthenticated: vi.fn(() => false) };
});

function renderRegister(search: string) {
  render(
    <MemoryRouter initialEntries={[`/register${search}`]}>
      <Routes>
        <Route path="/register" element={<Register />} />
      </Routes>
    </MemoryRouter>,
  );
  return screen.getByRole("link", { name: "Sign in" });
}

describe("Register page sign-in link", () => {
  it("goes to plain /login when there's nowhere to return to", () => {
    expect(renderRegister("")).toHaveAttribute("href", "/login");
  });

  it("carries an in-app returnTo back to /login", () => {
    expect(renderRegister("?returnTo=%2Fsecurity")).toHaveAttribute("href", "/login?returnTo=%2Fsecurity");
  });

  it.each([
    ["a protocol-relative URL", "//evil.example"],
    ["a tab-split URL", "/\t/evil.example"],
    ["an absolute URL", "https://evil.example/"],
  ])("drops a returnTo that leaves the app (%s)", (_label, returnTo) => {
    expect(renderRegister(`?returnTo=${encodeURIComponent(returnTo)}`)).toHaveAttribute("href", "/login");
  });
});
