import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import CreateDropCard from "../CreateDropCard";

vi.mock("@/store/dropsApi", () => ({
  useCreateDropMutation: () => [vi.fn(), { isLoading: false }],
}));

describe("CreateDropCard", () => {
  beforeEach(() => {
    vi.stubEnv("TZ", "America/Chicago");
    vi.useFakeTimers({ toFake: ["Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("defaults the date to today on a US evening, not tomorrow", () => {
    // 8pm on Nov 14 in Chicago is already Nov 15 in UTC.
    vi.setSystemTime(new Date("2026-11-15T02:00:00Z"));
    render(<CreateDropCard onCreated={vi.fn()} />);
    expect(screen.getByLabelText(/Date/)).toHaveValue("2026-11-14");
  });
});
