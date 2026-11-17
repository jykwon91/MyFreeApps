import "@platform/mobile/test-support/reactNativeFormData";
import { ToastProvider } from "@platform/mobile";
import { baseApi } from "@platform/core/store/baseApi";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { Provider } from "react-redux";
import CameraRoute from "../app/(app)/camera";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { store } from "../src/lib/store";
import { resetFakeFiles } from "@platform/mobile/test-support/fakeFileSystem";

const INSETS = { top: 47, bottom: 34, left: 0, right: 0 };
const mockTakePicture = jest.fn();
let mockPermission: { granted: boolean; canAskAgain: boolean };
let mockAllowed: boolean;

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) }));
jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("expo-router", () => ({ Redirect: () => null, router: { dismissTo: jest.fn() } }));
jest.mock("../src/features/workspace/useCanWrite", () => ({ useCanWrite: () => true }));
jest.mock("../src/features/aiPermission/useHasAiPermission", () => ({ useHasAiPermission: () => mockAllowed }));
jest.mock("expo-camera", () => {
  const { forwardRef, useImperativeHandle } = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  return {
    CameraView: forwardRef(function CameraView(props: object, ref: unknown) {
      useImperativeHandle(ref, () => ({ takePictureAsync: mockTakePicture }));
      return <View {...props} />;
    }),
    useCameraPermissions: () => [mockPermission, jest.fn()],
  };
});

beforeEach(() => {
  resetFakeFiles(["doc:/taken.jpg"]);
  mockPermission = { granted: true, canAskAgain: true };
  mockAllowed = true;
  mockTakePicture.mockResolvedValue({ uri: "doc:/taken.jpg" });
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
});

async function showRoute(): Promise<void> {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <CameraRoute />
      </ToastProvider>
    </Provider>,
  );
}

function expectInsetsCleared(): void {
  const style = StyleSheet.flatten(screen.getByTestId("camera-route").props.style);
  expect(style.paddingTop).toBe(INSETS.top);
  expect(style.paddingBottom).toBe(INSETS.bottom);
}

describe("the camera route clears the status bar and home indicator", () => {
  it("while taking a photo", async () => {
    await showRoute();
    await screen.findByRole("button", { name: "Take photo" });
    expectInsetsCleared();
  });

  it("while reviewing the photo, so Use and Retake aren't under the home indicator", async () => {
    await showRoute();
    await fireEvent.press(await screen.findByRole("button", { name: "Take photo" }));
    await screen.findByRole("button", { name: "Retake" });
    expectInsetsCleared();
  });

  it("while asking for camera access", async () => {
    mockPermission = { granted: false, canAskAgain: true };
    await showRoute();
    await screen.findByRole("button", { name: "Allow camera" });
    expectInsetsCleared();
  });

  it("while asking for AI permission", async () => {
    mockAllowed = false;
    await showRoute();
    expectInsetsCleared();
  });
});
