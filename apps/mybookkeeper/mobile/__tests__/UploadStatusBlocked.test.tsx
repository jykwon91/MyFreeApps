import { fireEvent, render, screen } from "@testing-library/react-native";
import { Provider } from "react-redux";
import { resetFakeFiles } from "@platform/mobile/test-support/fakeFileSystem";
import { SIGN_IN_AGAIN_MESSAGE, UPLOAD_BLOCKED_REASONS } from "../src/constants/capture";
import UploadStatus from "../src/features/capture/UploadStatus";
import { addToQueue, pendingUploads } from "../src/features/capture/uploadQueueFiles";
import { uploadBlocked, uploadPhaseChanged, uploadStatusDismissed } from "../src/features/capture/uploadsSlice";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";

jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

const SOURCE = "doc:/source.jpg";

beforeEach(() => {
  resetFakeFiles([SOURCE]);
  session.tokenStore.set("token");
  store.dispatch(workspaceChosen("w1"));
  store.dispatch(uploadStatusDismissed());
  addToQueue("w1", SOURCE, "a.jpg");
});

async function renderStatus() {
  await render(
    <Provider store={store}>
      <UploadStatus />
    </Provider>,
  );
}

describe("upload status when the server won't take files from this person", () => {
  beforeEach(() => {
    store.dispatch(uploadBlocked(UPLOAD_BLOCKED_REASONS.viewOnly));
    store.dispatch(uploadPhaseChanged("blocked"));
  });

  it("gives the view-only reason and never promises to try again", async () => {
    await renderStatus();
    expect(screen.getByText(UPLOAD_BLOCKED_REASONS.viewOnly)).toBeTruthy();
    expect(screen.queryByText(/try again/i)).toBeNull();
    expect(screen.queryByText("Try again")).toBeNull();
  });

  it("takes the files off the phone when asked to remove them", async () => {
    await renderStatus();
    expect(pendingUploads("w1")).toHaveLength(1);
    fireEvent.press(screen.getByText("Remove them"));
    expect(pendingUploads("w1")).toHaveLength(0);
    expect(store.getState().uploads.phase).toBe("idle");
  });

  it("keeps the files when asked to keep them", async () => {
    await renderStatus();
    fireEvent.press(screen.getByText("Keep them"));
    expect(pendingUploads("w1")).toHaveLength(1);
  });
});

describe("upload status when the session has ended", () => {
  it("says to sign in again rather than that the server is unreachable", async () => {
    store.dispatch(uploadPhaseChanged("signedOut"));
    await renderStatus();
    expect(screen.getByText(SIGN_IN_AGAIN_MESSAGE)).toBeTruthy();
    expect(screen.queryByText(/couldn't send/i)).toBeNull();
  });
});
