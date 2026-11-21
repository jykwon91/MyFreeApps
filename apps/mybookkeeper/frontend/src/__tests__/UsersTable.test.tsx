import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import UsersTable from "@/admin/features/users/UsersTable";

const USERS = [
  { id: "u1", email: "me@example.com", name: "Me", role: "admin" as const, is_active: true, is_superuser: true, is_verified: true },
  { id: "u2", email: "other@example.com", name: "Other", role: "user" as const, is_active: true, is_superuser: false, is_verified: true },
  { id: "u3", email: "third@example.com", name: null, role: "user" as const, is_active: true, is_superuser: false, is_verified: false },
];

describe("UsersTable", () => {
  it("names the search box and gives each role picker its user's email", () => {
    render(
      <UsersTable
        users={USERS}
        isLoading={false}
        currentUserId="u1"
        isSuperuser
        searchQuery=""
        onSearchChange={vi.fn()}
        onRoleChange={vi.fn()}
        onConfirmAction={vi.fn()}
      />,
    );
    expect(screen.getByRole("textbox", { name: "Search users by email or name" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Role for other@example.com" })).toHaveValue("user");
    expect(screen.getByRole("combobox", { name: "Role for third@example.com" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Role for me@example.com" })).toBeNull();
  });
});
