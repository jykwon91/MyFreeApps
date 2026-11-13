import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Alert, Pressable, Text } from "react-native";
import { alertButton } from "../../test-support/alertButton";
import ToastProvider from "../components/ToastProvider";
import { useConfirmedRemoval } from "../hooks/useConfirmedRemoval";
import type { RemovalMessages } from "../types/RemovalMessages";
import type { RemovalOptions } from "../types/RemovalOptions";

const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);

const MESSAGES: RemovalMessages = {
  removeTitle: "Delete this?",
  removeBody: "It can't be undone.",
  remove: "Delete",
  keep: "Keep",
  removed: "Deleted.",
  gone: "Already gone.",
  couldntRemove: "Couldn't delete it.",
};

function Remover({ remove, options }: { remove: () => Promise<unknown>; options?: RemovalOptions }) {
  const { isRemoving, confirmRemove } = useConfirmedRemoval(remove, MESSAGES, options);
  return (
    <Pressable accessibilityRole="button" onPress={confirmRemove}>
      <Text>{isRemoving ? "removing" : "idle"}</Text>
    </Pressable>
  );
}

async function show(remove: () => Promise<unknown>, options?: RemovalOptions) {
  await render(
    <ToastProvider bottomOffset={0}>
      <Remover options={options} remove={remove} />
    </ToastProvider>,
  );
  await fireEvent.press(screen.getByRole("button"));
}

// What an RTK Query mutation rejects with once unwrapped.
const notFound = () => Promise.reject({ status: 404, data: { detail: "Not Found" } });

beforeEach(() => alert.mockClear());

describe("useConfirmedRemoval", () => {
  it("asks first, and Keep removes nothing", async () => {
    const remove = jest.fn(() => Promise.resolve());
    await show(remove);

    expect(alert).toHaveBeenCalledWith(MESSAGES.removeTitle, MESSAGES.removeBody, [
      { text: MESSAGES.keep, style: "cancel" },
      { text: MESSAGES.remove, style: "destructive", onPress: expect.any(Function) },
    ]);
    expect(alertButton(MESSAGES.keep).onPress).toBeUndefined();
    expect(remove).not.toHaveBeenCalled();
  });

  it("removes on confirm, says so, and reports it gone, staying busy while the screen leaves", async () => {
    const onRemoved = jest.fn();
    await show(() => Promise.resolve(), { onRemoved });
    await act(async () => alertButton(MESSAGES.remove).onPress?.());

    expect(screen.getByRole("alert", { name: MESSAGES.removed })).toBeTruthy();
    expect(onRemoved).toHaveBeenCalledTimes(1);
    expect(screen.getByText("removing")).toBeTruthy();
  });

  it("treats a 404 as already gone", async () => {
    const onRemoved = jest.fn();
    await show(notFound, { onRemoved });
    await act(async () => alertButton(MESSAGES.remove).onPress?.());

    expect(screen.getByRole("alert", { name: MESSAGES.gone })).toBeTruthy();
    expect(onRemoved).toHaveBeenCalledTimes(1);
  });

  it("says when it couldn't remove it, and lets it be tried again", async () => {
    const onRemoved = jest.fn();
    await show(() => Promise.reject(new Error("offline")), { onRemoved });
    await act(async () => alertButton(MESSAGES.remove).onPress?.());

    expect(screen.getByRole("alert", { name: MESSAGES.couldntRemove })).toBeTruthy();
    expect(onRemoved).not.toHaveBeenCalled();
    expect(screen.getByText("idle")).toBeTruthy();
  });

  it("shows the server's refusal instead, and reports it", async () => {
    const onRefused = jest.fn();
    await show(() => Promise.reject(new Error("409")), { refusalMessage: () => "It's still in use.", onRefused });
    await act(async () => alertButton(MESSAGES.remove).onPress?.());

    expect(screen.getByRole("alert", { name: "It's still in use." })).toBeTruthy();
    expect(onRefused).toHaveBeenCalledTimes(1);
  });
});
