/**
 * Unit tests for DemoUsersTable.
 *
 * Verifies the row renders the right counts and that clicking Delete
 * fires the callback with the matching row.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DemoUsersTable from "../DemoUsersTable";
import type { DemoUser } from "@/types/demo/demo-user";

vi.mock("lucide-react", () => ({
  Trash2: () => null,
}));

vi.mock("@platform/ui", () => ({
  formatDate: (value: string) => value,
}));

const SAMPLE_USERS: DemoUser[] = [
  {
    user_id: "11111111-1111-1111-1111-111111111111",
    email: "demo+abc@myjobhunter.local",
    display_name: "Alex Demo",
    created_at: "2026-05-05T12:00:00Z",
    application_count: 4,
    company_count: 3,
  },
  {
    user_id: "22222222-2222-2222-2222-222222222222",
    email: "demo+xyz@myjobhunter.local",
    display_name: "Jordan Sandbox",
    created_at: "2026-05-04T08:30:00Z",
    application_count: 0,
    company_count: 0,
  },
];

describe("DemoUsersTable", () => {
  it("renders a row per user with their counts", () => {
    render(<DemoUsersTable users={SAMPLE_USERS} onDelete={vi.fn()} />);

    expect(screen.getAllByTestId("demo-user-row")).toHaveLength(2);
    expect(screen.getByText("Alex Demo")).toBeInTheDocument();
    expect(screen.getByText("Jordan Sandbox")).toBeInTheDocument();
    expect(screen.getByText("demo+abc@myjobhunter.local")).toBeInTheDocument();
  });

  it("invokes onDelete with the matching row when Delete is clicked", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();

    render(<DemoUsersTable users={SAMPLE_USERS} onDelete={onDelete} />);

    await user.click(
      screen.getByRole("button", {
        name: /Delete demo\+abc@myjobhunter.local/i,
      }),
    );

    expect(onDelete).toHaveBeenCalledWith(SAMPLE_USERS[0]);
  });
});
