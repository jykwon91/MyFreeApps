import { useCallback, useEffect, useState } from "react";
import { readLocalStorage, writeLocalStorage } from "../lib/safeStorage";

type Theme = "light" | "dark" | "system";

// Guarded storage (safeStorage): where the browser blocks storage — e.g. a
// third-party iframe such as a Discord Activity — the toggle still works for
// the session and the choice simply isn't remembered.
const STORAGE_KEY = "v1_theme";

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme): void {
  const resolved = theme === "system" ? getSystemTheme() : theme;
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

export function useTheme(): { theme: Theme; setTheme: (next: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = readLocalStorage(STORAGE_KEY);
    return (stored === "light" || stored === "dark" || stored === "system") ? stored : "system";
  });

  const setTheme = useCallback((next: Theme) => {
    writeLocalStorage(STORAGE_KEY, next);
    setThemeState(next);
    applyTheme(next);
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Listen for system theme changes when in "system" mode
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return { theme, setTheme };
}
