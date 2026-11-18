import { waitFor } from "@testing-library/react-native";
import { store } from "../src/lib/store";

/** Waits until no request is in flight, so a retry pressed next isn't swallowed by one that's still running. */
export async function queriesSettled(inStore: Pick<typeof store, "getState"> = store): Promise<void> {
  await waitFor(() => {
    const pending = Object.values(inStore.getState().api.queries).filter((query) => query?.status === "pending");
    expect(pending).toEqual([]);
  });
}
