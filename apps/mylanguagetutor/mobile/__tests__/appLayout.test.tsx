import { useToast } from "@platform/mobile";
import { fireEvent, screen } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import { Pressable, Text } from "react-native";
import AppLayout from "../app/(app)/_layout";

jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

function Sender() {
  const { showToast } = useToast();
  return (
    <Pressable onPress={() => showToast("Saved.")}>
      <Text>Send</Text>
    </Pressable>
  );
}

describe("the signed-in layout", () => {
  it("lets every screen in it show a toast", async () => {
    await renderRouter({ "(app)/_layout": AppLayout, "(app)/index": Sender }, { initialUrl: "/" });
    await fireEvent.press(screen.getByText("Send"));
    expect(screen.getByRole("alert", { name: "Saved." })).toBeTruthy();
  });
});
