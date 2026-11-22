import { ToastProvider } from "@platform/mobile";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
import MarkdownText from "../src/features/markdown/MarkdownText";

async function show(source: string) {
  await render(
    <ToastProvider bottomOffset={0}>
      <MarkdownText source={source} />
    </ToastProvider>,
  );
}

describe("MarkdownText", () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it("draws a list as separate items and a link as a link, without the marks", async () => {
    await show("Close to:\n\n- The lake\n- **Downtown**\n\nSee [the map](https://maps.example/lake).");
    expect(screen.getByText("The lake")).toBeTruthy();
    expect(screen.getByText("Downtown")).toBeTruthy();
    expect(screen.queryByText(/- The lake/)).toBeNull();
    const link = screen.getByRole("link", { name: "the map" });
    expect(link.props.accessibilityHint).toBe("Opens your browser");
    expect(screen.queryByText(/\]\(https/)).toBeNull();
  });

  it("opens a link through the app's opener", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await show("Write to [the host](mailto:host@example.com) or see [the map](https://maps.example/lake).");
    await fireEvent.press(screen.getByRole("link", { name: "the map" }));
    expect(open).toHaveBeenCalledWith("https://maps.example/lake");
    await fireEvent.press(screen.getByRole("link", { name: "the host" }));
    expect(open).toHaveBeenCalledWith("mailto:host@example.com");
  });

  it("says so when the phone can't open a link, as the app's other links do", async () => {
    jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("no browser"));
    await show("See [the map](https://maps.example/lake).");
    await fireEvent.press(screen.getByRole("link", { name: "the map" }));
    expect(await screen.findByText("I couldn't open that on this phone.")).toBeTruthy();
  });

  it.each([
    ["javascript:", "[the map](javascript:alert(1))"],
    ["data:", "[the map](data:text/html;base64,PHNjcmlwdD4=)"],
    ["an app's own scheme", "[the map](mybookkeeper://settings)"],
  ])("never opens a %s link, and keeps its words as plain text", async (_scheme, source) => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await show(source);
    expect(screen.queryByRole("link")).toBeNull();
    await fireEvent.press(screen.getByText("the map"));
    expect(open).not.toHaveBeenCalled();
  });

  it("decodes entities such as &amp; as the website does", async () => {
    await show("Tom &amp; Jerry&nbsp;welcome");
    expect(screen.getByText("Tom & Jerry\u00a0welcome")).toBeTruthy();
    expect(screen.queryByText(/&amp;/)).toBeNull();
  });

  it("leaves images out, as the website does", async () => {
    await show("Before ![tracking pixel](https://tracker.example/p.png) after");
    expect(screen.getByText(/Before/)).toBeTruthy();
    expect(screen.queryByText(/tracking pixel/)).toBeNull();
    expect(screen.queryByLabelText(/tracking pixel/)).toBeNull();
  });

  it("marks headings as headings", async () => {
    await show("# House rules\n\nQuiet after ten.");
    expect(screen.getByRole("header", { name: "House rules" })).toBeTruthy();
  });
});
