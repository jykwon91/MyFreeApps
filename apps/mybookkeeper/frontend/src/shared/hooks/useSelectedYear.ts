import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import type { YearOption } from "@/shared/types/dashboard/year-option";

const STORAGE_KEY = "mbk:selectedYear";
const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 2000;
const MAX_YEAR = CURRENT_YEAR + 1;

function parseYearOption(raw: string | null): YearOption | null {
  if (raw === null) return null;
  if (raw === "all") return "all";
  const n = Number(raw);
  if (Number.isInteger(n) && n >= MIN_YEAR && n <= MAX_YEAR) return n;
  return null;
}

function readFromStorage(): YearOption | null {
  try {
    return parseYearOption(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function writeToStorage(year: YearOption): void {
  try {
    localStorage.setItem(STORAGE_KEY, year === "all" ? "all" : String(year));
  } catch {
    // localStorage may be unavailable in some environments
  }
}

export function useSelectedYear(): [YearOption, (year: YearOption) => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  const urlRaw = searchParams.get("year");
  const fromUrl = parseYearOption(urlRaw);
  const fromStorage = readFromStorage();

  // URL wins, then localStorage, then current year
  const selectedYear: YearOption = fromUrl ?? fromStorage ?? CURRENT_YEAR;

  const setSelectedYear = useCallback(
    (year: YearOption) => {
      writeToStorage(year);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("year", year === "all" ? "all" : String(year));
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return [selectedYear, setSelectedYear];
}
