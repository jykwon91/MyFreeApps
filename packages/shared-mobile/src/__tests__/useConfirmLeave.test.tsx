import { act, screen } from "@testing-library/react-native";
import { router, Stack } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import { useState } from "react";
import { Text } from "react-native";
import { useConfirmLeave } from "../hooks/useConfirmLeave";

const ask = jest.fn<void, [() => void]>();

function GuardedScreen({ shouldGuard }: { shouldGuard: boolean }) {
  useConfirmLeave(shouldGuard, ask);
  return <Text>guarded-screen</Text>;
}

/** Like a form saved from the warning: nothing unsaved by the time it leaves. */
function SavedThenLeavingScreen() {
  const [isDirty, setIsDirty] = useState(true);
  useConfirmLeave(isDirty, (leave) => {
    void Promise.resolve().then(() => {
      setIsDirty(false);
      leave();
    });
  });
  return <Text>guarded-screen</Text>;
}

/** The real router, because a mocked one can't tell whether the screen really goes. */
async function openGuardedScreen(shouldGuard: boolean): Promise<void> {
  await renderRouter(
    {
      _layout: () => <Stack />,
      index: () => <Text>previous-screen</Text>,
      guarded: () => <GuardedScreen shouldGuard={shouldGuard} />,
    },
    { initialUrl: "/" },
  );
  await act(async () => {
    router.push("/guarded");
  });
  await act(async () => {
    router.back();
  });
}

beforeEach(() => ask.mockReset());

it("stops the screen going and asks", async () => {
  await openGuardedScreen(true);
  expect(ask).toHaveBeenCalledTimes(1);
  expect(screen.getByText("guarded-screen")).toBeTruthy();
});

it("really leaves when told to, without asking again or the router warning about it", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  await openGuardedScreen(true);
  const leave = ask.mock.calls[0]?.[0];
  await act(async () => leave?.());
  expect(ask).toHaveBeenCalledTimes(1);
  expect(screen.getByText("previous-screen")).toBeTruthy();
  expect(screen.queryByText("guarded-screen")).toBeNull();
  expect(warn).not.toHaveBeenCalled();
  warn.mockRestore();
});

it("keeps guarding if I choose to stay", async () => {
  await openGuardedScreen(true);
  await act(async () => {
    router.back();
  });
  expect(ask).toHaveBeenCalledTimes(2);
  expect(screen.getByText("guarded-screen")).toBeTruthy();
});

it("leaves once, after a save has cleared what was unsaved", async () => {
  await renderRouter(
    {
      _layout: () => <Stack />,
      index: () => <Text>first-screen</Text>,
      middle: () => <Text>previous-screen</Text>,
      guarded: () => <SavedThenLeavingScreen />,
    },
    { initialUrl: "/" },
  );
  await act(async () => {
    router.push("/middle");
  });
  await act(async () => {
    router.push("/guarded");
  });
  await act(async () => {
    router.back();
  });
  expect(screen.getByText("previous-screen")).toBeTruthy();
});

it("doesn't get in the way when there's nothing to guard", async () => {
  await openGuardedScreen(false);
  expect(ask).not.toHaveBeenCalled();
  expect(screen.getByText("previous-screen")).toBeTruthy();
});
