/**
 * Unit tests for the welcome-manual room manager.
 *
 * Verifies:
 *   - The empty state renders when a manual has no rooms, and says the guide
 *     still goes out whole (the pre-rooms behaviour is unchanged).
 *   - Clicking "Add room" creates a room seeded with the default name.
 *   - Rooms render in display order with their room-only section count.
 *   - Renaming a room saves on blur, and an unchanged name saves nothing.
 *   - The "Add room" button is disabled once the manual hits the room cap.
 *   - Deleting asks first, and the confirm copy names how many room-only
 *     sections go with it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WelcomeManualRoomManager from "@/app/features/welcome-manuals/WelcomeManualRoomManager";
import {
  NEW_ROOM_DEFAULT_NAME,
  WELCOME_MANUAL_MAX_ROOMS,
} from "@/shared/lib/welcome-manual-constants";
import type { WelcomeManualRoomResponse } from "@/shared/types/welcome-manual/welcome-manual-room-response";

const createRoomMock = vi.fn();
const updateRoomMock = vi.fn();
const deleteRoomMock = vi.fn();

vi.mock("@/shared/lib/toast-store", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

vi.mock("@/shared/store/welcomeManualsApi", () => ({
  useCreateRoomMutation: vi.fn(() => [createRoomMock, { isLoading: false }]),
  useUpdateRoomMutation: vi.fn(() => [updateRoomMock, { isLoading: false }]),
  useDeleteRoomMutation: vi.fn(() => [deleteRoomMock, { isLoading: false }]),
}));

function makeRoom(
  overrides: Partial<WelcomeManualRoomResponse> = {},
): WelcomeManualRoomResponse {
  return {
    id: "room-1",
    manual_id: "m-1",
    name: "Front bedroom",
    display_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderManager(
  rooms: WelcomeManualRoomResponse[],
  sectionCountByRoom: Map<string, number> = new Map(),
) {
  return render(
    <WelcomeManualRoomManager
      manualId="m-1"
      rooms={rooms}
      sectionCountByRoom={sectionCountByRoom}
    />,
  );
}

describe("WelcomeManualRoomManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the empty state when there are no rooms", () => {
    renderManager([]);
    expect(screen.getByTestId("welcome-manual-room-empty-state")).toHaveTextContent(
      "this guide goes out whole",
    );
    expect(screen.queryByTestId("welcome-manual-room-list")).not.toBeInTheDocument();
  });

  it("creates a room seeded with the default name when Add room is clicked", async () => {
    createRoomMock.mockReturnValue({ unwrap: () => Promise.resolve(makeRoom()) });
    renderManager([]);

    await userEvent.click(screen.getByTestId("welcome-manual-room-add-button"));

    await waitFor(() => {
      expect(createRoomMock).toHaveBeenCalledWith({
        manualId: "m-1",
        data: { name: NEW_ROOM_DEFAULT_NAME },
      });
    });
  });

  it("lists rooms in display order with their room-only section count", () => {
    renderManager(
      [
        makeRoom({ id: "room-2", name: "Back bedroom", display_order: 1 }),
        makeRoom({ id: "room-1", name: "Front bedroom", display_order: 0 }),
      ],
      new Map([
        ["room-1", 1],
        ["room-2", 3],
      ]),
    );

    const names = screen.getAllByTestId("welcome-manual-room-name") as HTMLInputElement[];
    expect(names.map((n) => n.value)).toEqual(["Front bedroom", "Back bedroom"]);

    const counts = screen.getAllByTestId("welcome-manual-room-section-count");
    expect(counts.map((c) => c.textContent)).toEqual(["1 section", "3 sections"]);
  });

  it("shows a zero count for a room with no room-only sections", () => {
    renderManager([makeRoom()]);
    expect(screen.getByTestId("welcome-manual-room-section-count")).toHaveTextContent(
      "0 sections",
    );
  });

  it("saves a renamed room on blur", async () => {
    updateRoomMock.mockReturnValue({ unwrap: () => Promise.resolve(makeRoom()) });
    renderManager([makeRoom()]);

    const name = screen.getByTestId("welcome-manual-room-name");
    await userEvent.clear(name);
    await userEvent.type(name, "Garage studio");
    await userEvent.tab();

    await waitFor(() => {
      expect(updateRoomMock).toHaveBeenCalledWith({
        manualId: "m-1",
        roomId: "room-1",
        data: { name: "Garage studio" },
      });
    });
  });

  it("does not save on blur when the name is unchanged", async () => {
    renderManager([makeRoom()]);
    await userEvent.click(screen.getByTestId("welcome-manual-room-name"));
    await userEvent.tab();
    expect(updateRoomMock).not.toHaveBeenCalled();
  });

  it("does not save an emptied room name", async () => {
    renderManager([makeRoom()]);
    await userEvent.clear(screen.getByTestId("welcome-manual-room-name"));
    await userEvent.tab();
    expect(updateRoomMock).not.toHaveBeenCalled();
  });

  it("disables the Add room button once the manual hits the room cap", () => {
    const rooms = Array.from({ length: WELCOME_MANUAL_MAX_ROOMS }, (_, i) =>
      makeRoom({ id: `room-${i}`, name: `Room ${i}`, display_order: i }),
    );
    renderManager(rooms);
    expect(screen.getByTestId("welcome-manual-room-add-button")).toBeDisabled();
    expect(screen.getByTestId("welcome-manual-room-cap")).toBeInTheDocument();
  });

  it("warns how many room-only sections a delete takes with it", async () => {
    renderManager([makeRoom()], new Map([["room-1", 2]]));

    await userEvent.click(screen.getByTestId("welcome-manual-room-delete"));

    expect(screen.getByText("Remove this room?")).toBeInTheDocument();
    expect(
      screen.getByText(/2 sections written only for this room will be deleted/),
    ).toBeInTheDocument();
    expect(deleteRoomMock).not.toHaveBeenCalled();
  });

  it("reassures that shared sections stay when the room has none of its own", async () => {
    renderManager([makeRoom()]);
    await userEvent.click(screen.getByTestId("welcome-manual-room-delete"));
    expect(screen.getByText(/Shared sections stay — only this room goes/)).toBeInTheDocument();
  });

  it("deletes the room once the confirm is accepted", async () => {
    deleteRoomMock.mockReturnValue({ unwrap: () => Promise.resolve(undefined) });
    renderManager([makeRoom()]);

    await userEvent.click(screen.getByTestId("welcome-manual-room-delete"));
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(deleteRoomMock).toHaveBeenCalledWith({ manualId: "m-1", roomId: "room-1" });
    });
  });
});
