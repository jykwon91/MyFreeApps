import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import InvitesList from "../InvitesList";

vi.mock("@myjobhunter/api-client/store/invitesApi", () => ({
  useListInvitesQuery: () => ({ data: [], isLoading: false, isError: false }),
}));

describe("InvitesList empty state", () => {
  it("draws the icon as an svg, never the icon's name as text", () => {
    const { container } = render(<InvitesList />);

    expect(screen.getByText("No pending invites")).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeNull();
    expect(screen.queryByText("Mail")).not.toBeInTheDocument();
  });
});
