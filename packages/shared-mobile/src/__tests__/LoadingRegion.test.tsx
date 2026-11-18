import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import LoadingRegion from "../components/LoadingRegion";
import Skeleton from "../components/Skeleton";
import { LOADING_REGION_DEFAULT_LABEL } from "../constants/loadingRegion";

describe("LoadingRegion", () => {
  it("is one busy progress indicator a screen reader reads as Loading", async () => {
    await render(
      <LoadingRegion testID="region">
        <Skeleton testID="bar" />
      </LoadingRegion>,
    );

    const region = screen.getByRole("progressbar", { name: LOADING_REGION_DEFAULT_LABEL });
    expect(region.props.accessible).toBe(true);
    expect(region.props.accessibilityState).toEqual({ busy: true });
    expect(screen.getByTestId("region")).toBe(region);
  });

  it("reads a more specific label when given one", async () => {
    await render(
      <LoadingRegion label="Loading your vendors">
        <Skeleton />
      </LoadingRegion>,
    );

    expect(screen.getByRole("progressbar", { name: "Loading your vendors" })).toBeTruthy();
    expect(screen.queryByLabelText(LOADING_REGION_DEFAULT_LABEL)).toBeNull();
  });

  it("keeps the skeleton bars inside hidden, so only the label is read", async () => {
    await render(
      <LoadingRegion>
        <Skeleton testID="bar" />
      </LoadingRegion>,
    );

    expect(screen.queryByTestId("bar")).toBeNull();
    expect(screen.getByTestId("bar", { includeHiddenElements: true })).toBeTruthy();
  });

  it("passes on its style and live region", async () => {
    await render(
      <LoadingRegion accessibilityLiveRegion="polite" style={{ gap: 8 }} testID="region">
        <Skeleton />
      </LoadingRegion>,
    );

    const region = screen.getByTestId("region");
    expect(StyleSheet.flatten(region.props.style)).toEqual({ gap: 8 });
    expect(region.props.accessibilityLiveRegion).toBe("polite");
  });
});
