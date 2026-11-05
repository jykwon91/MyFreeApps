import { TWO_STEP_MESSAGES as MESSAGES, type TwoStepLeaveRisk } from "@platform/mobile";
import { act, screen } from "@testing-library/react-native";
import { router, Stack } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import { Alert, Text } from "react-native";
import SecurityTurnOnScreen from "../src/features/security/SecurityTurnOnScreen";

interface TurnOnProps {
  appName: string;
  onLeaveRiskChange: (risk: TwoStepLeaveRisk) => void;
  onFinished: () => void;
}

const mockTurnOnScreen: { props: TurnOnProps | null } = { props: null };
jest.mock("@platform/mobile", () => {
  const { Text: MockText } = jest.requireActual("react-native");
  return {
    ...jest.requireActual("@platform/mobile"),
    TwoStepTurnOnScreen: (props: TurnOnProps) => {
      mockTurnOnScreen.props = props;
      return <MockText>turn-on-screen</MockText>;
    },
  };
});

function turnOn(): TurnOnProps {
  if (!mockTurnOnScreen.props) throw new Error("not rendered");
  return mockTurnOnScreen.props;
}

/** The real router, because a mock can't tell whether a guarded screen really leaves. */
async function openFromSecurity(): Promise<void> {
  await renderRouter(
    {
      _layout: () => <Stack />,
      index: () => <Text>security-screen</Text>,
      "turn-on": () => <SecurityTurnOnScreen />,
    },
    { initialUrl: "/" },
  );
  await act(async () => {
    router.push("/turn-on");
  });
}

async function tryToLeave(): Promise<void> {
  await act(async () => {
    router.back();
  });
}

const alert = jest.spyOn(Alert, "alert");

beforeEach(() => {
  alert.mockReset();
  alert.mockImplementation(() => undefined);
});

it("names the app", async () => {
  await openFromSecurity();
  expect(turnOn().appName).toBe("MyBookkeeper");
});

it("lets me leave freely before anything is at stake", async () => {
  await openFromSecurity();
  await tryToLeave();
  expect(alert).not.toHaveBeenCalled();
  expect(screen.getByText("security-screen")).toBeTruthy();
});

it("keeps me here while turning on, with no way to leave anyway", async () => {
  await openFromSecurity();
  await act(async () => turnOn().onLeaveRiskChange("turning_on"));
  await tryToLeave();

  expect(alert).toHaveBeenCalledWith(MESSAGES.stillTurningOnTitle, MESSAGES.stillTurningOnBody, expect.any(Array));
  expect(alert.mock.calls[0]?.[2]?.map((button) => button.text)).toEqual([MESSAGES.stay]);
  expect(screen.getByText("turn-on-screen")).toBeTruthy();
});

it("warns before leaving the codes, and staying stays", async () => {
  await openFromSecurity();
  await act(async () => turnOn().onLeaveRiskChange("codes"));
  await tryToLeave();

  expect(alert).toHaveBeenCalledWith(MESSAGES.leaveTitle, MESSAGES.leaveBody, expect.any(Array));
  expect(screen.getByText("turn-on-screen")).toBeTruthy();
});

it("Leave anyway really leaves, without asking again", async () => {
  await openFromSecurity();
  await act(async () => turnOn().onLeaveRiskChange("codes"));
  await tryToLeave();
  const leave = alert.mock.calls[0]?.[2]?.find((button) => button.text === MESSAGES.leaveAnyway);
  await act(async () => leave?.onPress?.());

  expect(alert).toHaveBeenCalledTimes(1);
  expect(screen.getByText("security-screen")).toBeTruthy();
  expect(screen.queryByText("turn-on-screen")).toBeNull();
});

it("finishing goes back with no warning", async () => {
  await openFromSecurity();
  await act(async () => turnOn().onLeaveRiskChange("codes"));
  await act(async () => {
    turnOn().onLeaveRiskChange("none");
    turnOn().onFinished();
  });

  expect(alert).not.toHaveBeenCalled();
  expect(screen.getByText("security-screen")).toBeTruthy();
});

it("finishing from a link, with nothing to go back to, lands on Security", async () => {
  await renderRouter(
    {
      _layout: () => <Stack />,
      "security/index": () => <Text>security-screen</Text>,
      "security/turn-on": () => <SecurityTurnOnScreen />,
    },
    { initialUrl: "/security/turn-on" },
  );
  await act(async () => turnOn().onFinished());
  expect(screen.getByText("security-screen")).toBeTruthy();
});
