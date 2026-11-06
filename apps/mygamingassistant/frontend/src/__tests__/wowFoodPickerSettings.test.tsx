import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useFoodPickerSettings } from "@/games/wow-forever/hooks/useFoodPickerSettings";

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={["/wow-forever/food"]}>{children}</MemoryRouter>;
}

describe("useFoodPickerSettings", () => {
  beforeEach(() => window.localStorage.clear());

  it("keeps a level typed just before a class is picked, before the page re-renders", () => {
    const { result } = renderHook(() => useFoodPickerSettings(), { wrapper });
    act(() => {
      const [, update] = result.current;
      update({ level: 45 });
      update({ classId: "mage" });
    });
    expect(result.current[0].level).toBe(45);
    expect(result.current[0].classId).toBe("mage");
  });
});
