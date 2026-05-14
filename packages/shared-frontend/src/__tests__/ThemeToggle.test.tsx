import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ThemeToggle from "../components/ui/ThemeToggle";

const STORAGE_KEY = "v1_theme";

function setSystemPrefersDark(isDark: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-color-scheme: dark)" && isDark,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    setSystemPrefersDark(false);
  });

  it("renders three options: Light, Dark, System", () => {
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "Light" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Dark" })).toBeDefined();
    expect(screen.getByRole("button", { name: "System" })).toBeDefined();
  });

  it("defaults to System when no preference is stored", () => {
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "System" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("reflects the stored preference on mount", () => {
    localStorage.setItem(STORAGE_KEY, "dark");
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("persists the choice to localStorage on click", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole("button", { name: "Dark" }));
    expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
  });

  it("applies the `dark` class on <html> when Dark is selected", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole("button", { name: "Dark" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("removes the `dark` class when Light is selected", async () => {
    const user = userEvent.setup();
    localStorage.setItem(STORAGE_KEY, "dark");
    render(<ThemeToggle />);
    await user.click(screen.getByRole("button", { name: "Light" }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("falls back to OS preference when System is selected", async () => {
    const user = userEvent.setup();
    setSystemPrefersDark(true);
    localStorage.setItem(STORAGE_KEY, "light");
    render(<ThemeToggle />);
    await user.click(screen.getByRole("button", { name: "System" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("system");
  });
});
