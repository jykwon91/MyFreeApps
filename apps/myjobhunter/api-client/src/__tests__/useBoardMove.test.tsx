// @vitest-environment jsdom
/**
 * useBoardMove's idempotency keys: a retry of the same move after a lost answer
 * reuses its key, and a different move, or one the server has decided, gets a new one.
 */
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useBoardMove } from "../hooks/useBoardMove";
import type { KanbanItem } from "../types/kanban/kanban-item";

const dispatch = vi.fn();
vi.mock("react-redux", () => ({ useDispatch: () => dispatch }));
vi.mock("../store/moveKanbanItem", () => ({ moveKanbanItem: (args: unknown) => args }));

const ITEM = { id: "a1" } as KanbanItem;
const LOST = { status: undefined, data: null };
const REFUSED = { status: 400, data: { detail: "not allowed" } };

function render() {
  let count = 0;
  const notify = vi.fn();
  const view = renderHook(() => useBoardMove({ newKey: () => `key-${++count}`, notify }));
  return { ...view, notify };
}

function keysSent(): string[] {
  return dispatch.mock.calls.map(([args]) => (args as { idempotencyKey: string }).idempotencyKey);
}

beforeEach(() => dispatch.mockReset());

describe("useBoardMove keys", () => {
  it("reuses the key when the same move is retried after a lost answer", async () => {
    dispatch.mockRejectedValueOnce(LOST).mockResolvedValueOnce({});
    const { result } = render();

    await act(() => result.current.moveTo(ITEM, "applied", "offer"));
    await act(() => result.current.moveTo(ITEM, "applied", "offer"));

    expect(keysSent()).toEqual(["key-1", "key-1"]);
  });

  it("uses a new key for a different move", async () => {
    dispatch.mockRejectedValueOnce(LOST).mockResolvedValueOnce({});
    const { result } = render();

    await act(() => result.current.moveTo(ITEM, "applied", "offer"));
    await act(() => result.current.moveTo(ITEM, "applied", "closed"));

    expect(keysSent()).toEqual(["key-1", "key-2"]);
  });

  it("uses a new key once the server has refused the move", async () => {
    dispatch.mockRejectedValueOnce(REFUSED).mockResolvedValueOnce({});
    const { result } = render();

    await act(() => result.current.moveTo(ITEM, "applied", "offer"));
    await act(() => result.current.moveTo(ITEM, "applied", "offer"));

    expect(keysSent()).toEqual(["key-1", "key-2"]);
  });

  it("uses a new key once the move has gone through", async () => {
    dispatch.mockResolvedValue({});
    const { result } = render();

    await act(() => result.current.moveTo(ITEM, "applied", "offer"));
    await act(() => result.current.moveTo(ITEM, "offer", "applied"));
    await act(() => result.current.moveTo(ITEM, "applied", "offer"));

    expect(keysSent()).toEqual(["key-1", "key-2", "key-3"]);
  });
});
