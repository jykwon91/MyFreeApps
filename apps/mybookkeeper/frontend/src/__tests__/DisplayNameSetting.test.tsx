import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DisplayNameSetting from "@/app/features/security/DisplayNameSetting";

vi.mock("@/shared/lib/api", () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { id: "u1", email: "a@b.com", name: "Jane Smith" } }) },
}));

describe("DisplayNameSetting", () => {
  it("names the display name field", async () => {
    render(<DisplayNameSetting />);
    expect(await screen.findByDisplayValue("Jane Smith")).toBe(screen.getByRole("textbox", { name: "Display name" }));
  });
});
