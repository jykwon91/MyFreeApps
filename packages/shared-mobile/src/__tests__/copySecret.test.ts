import { getStringAsync, setStringAsync } from "expo-clipboard";
import { Platform } from "react-native";
import { CLIPBOARD_CLEAR_MS } from "../constants/twoStep";
import { copySecret } from "../utils/copySecret";

jest.mock("expo-clipboard", () => ({
  getStringAsync: jest.fn(),
  setStringAsync: jest.fn().mockResolvedValue(true),
}));

const read = jest.mocked(getStringAsync);
const write = jest.mocked(setStringAsync);

async function runClearTimer(): Promise<void> {
  await jest.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_MS);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("on iOS", () => {
  it("keeps it off other devices and lets the system expire it, without reading it back", async () => {
    await copySecret("SECRET");
    const options = write.mock.calls[0]?.[1];
    expect(options?.ios?.localOnly).toBe(true);
    expect(options?.ios?.expiresAt?.getTime()).toBe(Date.now() + CLIPBOARD_CLEAR_MS);

    await runClearTimer();
    expect(read).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledTimes(1);
  });
});

describe("on Android", () => {
  beforeEach(() => jest.replaceProperty(Platform, "OS", "android"));

  it("marks it sensitive and clears it after the wait", async () => {
    read.mockResolvedValue("SECRET");
    await copySecret("SECRET");
    expect(write.mock.calls[0]?.[1]?.android?.isSensitive).toBe(true);

    await runClearTimer();
    expect(write).toHaveBeenLastCalledWith("");
  });

  it("leaves alone anything copied since", async () => {
    read.mockResolvedValue("my shopping list");
    await copySecret("SECRET");
    await runClearTimer();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("a second copy restarts the wait instead of clearing it early", async () => {
    read.mockResolvedValue("SECOND");
    await copySecret("FIRST");
    await jest.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_MS - 1);
    await copySecret("SECOND");
    await jest.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_MS - 1);
    expect(read).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(write).toHaveBeenLastCalledWith("");
    expect(read).toHaveBeenCalledTimes(1);
  });
});
